import { Queue, Worker } from 'bullmq';
import type {
  ISchedulerService,
  ScheduledCall,
  CallSchedule,
  ICallOrchestrator,
} from '@donna/shared/interfaces';
import type { IScheduledCallRepository } from './repository';

/**
 * Scheduler Service
 *
 * Manages automated call scheduling using BullMQ and Upstash Redis.
 * Handles scheduling, retry logic, and execution of scheduled calls.
 */
export class SchedulerService implements ISchedulerService {
  private queue: Queue;
  private worker: Worker;

  constructor(
    private repository: IScheduledCallRepository,
    private callOrchestrator: ICallOrchestrator,
    private redisConnection: { host: string; port: number } | { url: string; token: string }
  ) {
    // Initialize BullMQ Queue
    this.queue = new Queue('scheduled-calls', {
      connection: redisConnection,
    });

    // Initialize BullMQ Worker
    this.worker = new Worker(
      'scheduled-calls',
      async (job) => {
        await this.executeScheduledCall(job.data.scheduleId);
      },
      {
        connection: redisConnection,
      }
    );

    // Set up worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`✓ Scheduled call job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`✗ Scheduled call job ${job?.id} failed:`, err);
    });
  }

  /**
   * Schedule a new call
   */
  async scheduleCall(schedule: CallSchedule): Promise<ScheduledCall> {
    // Create scheduled call record
    const scheduledCall = await this.repository.create(schedule);

    // Calculate delay until scheduled time
    const delay = schedule.scheduledTime.getTime() - Date.now();

    // Add job to queue
    await this.queue.add(
      'execute-call',
      { scheduleId: scheduledCall.id },
      {
        delay: Math.max(delay, 0), // Ensure non-negative delay
        jobId: scheduledCall.id,
        attempts: schedule.maxRetries || 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute initial backoff
        },
      }
    );

    console.log(`Scheduled call ${scheduledCall.id} for ${schedule.scheduledTime.toISOString()}`);

    return scheduledCall;
  }

  /**
   * Cancel a scheduled call
   */
  async cancelScheduledCall(scheduleId: string): Promise<void> {
    // Update database record
    await this.repository.cancel(scheduleId);

    // Remove job from queue
    const job = await this.queue.getJob(scheduleId);
    if (job) {
      await job.remove();
      console.log(`Cancelled scheduled call ${scheduleId}`);
    }
  }

  /**
   * Get upcoming calls (optionally filtered by senior)
   */
  async getUpcomingCalls(seniorId?: string, limit?: number): Promise<ScheduledCall[]> {
    if (seniorId) {
      return this.repository.findBySeniorId(seniorId, limit);
    }

    // Get all pending calls
    return this.repository.findPending(limit);
  }

  /**
   * Process due scheduled calls (called by cron)
   * Note: With BullMQ, this is handled automatically by the queue
   * This method is kept for manual triggering if needed
   */
  async processSchedule(): Promise<void> {
    const pending = await this.repository.findPending(50);

    for (const scheduled of pending) {
      // Check if job already exists in queue
      const existingJob = await this.queue.getJob(scheduled.id);

      if (!existingJob) {
        // Add to queue if not already scheduled
        await this.queue.add(
          'execute-call',
          { scheduleId: scheduled.id },
          {
            jobId: scheduled.id,
            attempts: scheduled.maxRetries,
            backoff: {
              type: 'exponential',
              delay: 60000,
            },
          }
        );
      }
    }
  }

  /**
   * Retry a failed call
   */
  async retryFailedCall(scheduleId: string): Promise<void> {
    const scheduled = await this.repository.findById(scheduleId);

    if (!scheduled) {
      throw new Error(`Scheduled call ${scheduleId} not found`);
    }

    if (scheduled.status !== 'failed') {
      throw new Error(`Scheduled call ${scheduleId} is not in failed status`);
    }

    if (scheduled.retryCount >= scheduled.maxRetries) {
      throw new Error(`Scheduled call ${scheduleId} has exceeded max retries`);
    }

    // Update status to pending
    await this.repository.update(scheduleId, { status: 'pending' });

    // Add back to queue
    await this.queue.add(
      'execute-call',
      { scheduleId },
      {
        jobId: scheduleId,
        attempts: scheduled.maxRetries - scheduled.retryCount,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      }
    );

    console.log(`Retrying scheduled call ${scheduleId}`);
  }

  /**
   * Update a scheduled call
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<CallSchedule>
  ): Promise<ScheduledCall> {
    const scheduled = await this.repository.findById(scheduleId);

    if (!scheduled) {
      throw new Error(`Scheduled call ${scheduleId} not found`);
    }

    // Update database record
    const updated = await this.repository.update(scheduleId, updates as Partial<ScheduledCall>);

    // If scheduled time changed, update queue job
    if (updates.scheduledTime) {
      const job = await this.queue.getJob(scheduleId);
      if (job) {
        await job.remove();

        const delay = updates.scheduledTime.getTime() - Date.now();
        await this.queue.add(
          'execute-call',
          { scheduleId },
          {
            delay: Math.max(delay, 0),
            jobId: scheduleId,
            attempts: scheduled.maxRetries,
            backoff: {
              type: 'exponential',
              delay: 60000,
            },
          }
        );
      }
    }

    return updated;
  }

  /**
   * Execute a scheduled call (called by BullMQ worker)
   */
  private async executeScheduledCall(scheduleId: string): Promise<void> {
    const scheduled = await this.repository.findById(scheduleId);

    if (!scheduled) {
      throw new Error(`Scheduled call ${scheduleId} not found`);
    }

    console.log(`Executing scheduled call ${scheduleId} for senior ${scheduled.seniorId}`);

    try {
      // Update status to in_progress
      await this.repository.update(scheduleId, { status: 'in_progress' });

      // Initiate the call
      const call = await this.callOrchestrator.initiateCall({
        seniorId: scheduled.seniorId,
        type: 'scheduled',
        reminderIds: scheduled.reminderIds,
      });

      // Update with conversation ID and mark as completed
      await this.repository.update(scheduleId, {
        status: 'completed',
        conversationId: call.id,
      });

      console.log(`✓ Scheduled call ${scheduleId} completed successfully`);
    } catch (error) {
      console.error(`✗ Scheduled call ${scheduleId} failed:`, error);

      // Increment retry count
      const newRetryCount = scheduled.retryCount + 1;

      // Update status
      await this.repository.update(scheduleId, {
        status: newRetryCount >= scheduled.maxRetries ? 'failed' : 'pending',
        retryCount: newRetryCount,
      });

      // Re-throw error for BullMQ to handle retries
      throw error;
    }
  }

  /**
   * Shutdown the scheduler gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down scheduler...');
    await this.worker.close();
    await this.queue.close();
    console.log('Scheduler shut down complete');
  }
}
