import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Check, Plus, Star, X, ChevronUp, ChevronDown,
  Trophy, History, Music, Film, Globe, Feather, Map, Cat, BookOpen, Flower, Plane, Utensils
} from 'lucide-react';
import './Onboarding.css';

interface Interest {
  topic: string;
  details: string;
}

interface FormData {
  seniorName: string;
  seniorPhone: string;
  relation: string;
  seniorCity: string;
  seniorState: string;
  seniorZip: string;
  interests: Interest[];
  additionalInfo: string;
  reminders: string[];
  updates: string[];
  callTime: string;
  callDays: string[];
}

interface TopicCategory {
  id: string;
  icon: React.ReactNode;
  question: string;
  placeholder: string;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    seniorName: '',
    seniorPhone: '',
    relation: 'Mother',
    seniorCity: '',
    seniorState: '',
    seniorZip: '',
    interests: [],
    additionalInfo: '',
    reminders: [''],
    updates: [],
    callTime: '10:30',
    callDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  });

  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const topicCategories: TopicCategory[] = [
    { id: 'Sports', icon: <Trophy size={24} />, question: "Which teams or players do they follow?", placeholder: "e.g., Detroit Lions, 1980s Celtics, Serena Williams..." },
    { id: 'History', icon: <History size={24} />, question: "Any specific eras or events they love?", placeholder: "e.g., WWII, Ancient Rome, Civil Rights Movement..." },
    { id: 'Music', icon: <Music size={24} />, question: "Who are their favorite bands or genres?", placeholder: "e.g., The Beatles, 50s Jazz, Opera, Frank Sinatra..." },
    { id: 'Film', icon: <Film size={24} />, question: "Favorite movies, actors, or genres?", placeholder: "e.g., Westerns, Audrey Hepburn, Casablanca..." },
    { id: 'Politics', icon: <Globe size={24} />, question: "What issues or figures do they follow closely?", placeholder: "e.g., Local elections, Environmental policy..." },
    { id: 'Poetry', icon: <Feather size={24} />, question: "Who are their favorite poets?", placeholder: "e.g., Maya Angelou, Robert Frost..." },
    { id: 'Geography', icon: <Map size={24} />, question: "Places they've lived or loved traveling to?", placeholder: "e.g., Paris, The Grand Canyon, childhood in Ohio..." },
    { id: 'Animals', icon: <Cat size={24} />, question: "Do they have pets or favorite animals?", placeholder: "e.g., Cats, Bird watching, Horses..." },
    { id: 'Literature', icon: <BookOpen size={24} />, question: "What books or authors do they enjoy?", placeholder: "e.g., Agatha Christie mysteries, Historical fiction..." },
    { id: 'Gardening', icon: <Flower size={24} />, question: "What do they like to grow?", placeholder: "e.g., Roses, Vegetable garden, Orchids..." },
    { id: 'Travel', icon: <Plane size={24} />, question: "Favorite trips or dream destinations?", placeholder: "e.g., Cruise to Alaska, Italy 1999..." },
    { id: 'Cooking', icon: <Utensils size={24} />, question: "Favorite cuisines or dishes to cook?", placeholder: "e.g., Italian food, Baking pies..." },
  ];

  const updateFormData = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleReminderChange = (index: number, value: string) => {
    const newReminders = [...formData.reminders];
    newReminders[index] = value;
    setFormData(prev => ({ ...prev, reminders: newReminders }));
  };

  const addReminder = () => {
    setFormData(prev => ({ ...prev, reminders: [...prev.reminders, ''] }));
  };

  const toggleUpdate = (topic: string) => {
    setFormData(prev => {
      const newUpdates = prev.updates.includes(topic)
        ? prev.updates.filter(t => t !== topic)
        : [...prev.updates, topic];
      return { ...prev, updates: newUpdates };
    });
  };

  const toggleDay = (day: string) => {
    setFormData(prev => {
      const newDays = prev.callDays.includes(day)
        ? prev.callDays.filter(d => d !== day)
        : [...prev.callDays, day];
      const dayOrder: Record<string, number> = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
      newDays.sort((a, b) => dayOrder[a] - dayOrder[b]);
      return { ...prev, callDays: newDays };
    });
  };

  const getFormattedSummary = () => {
    const days = formData.callDays;
    if (days.length === 0) return "No days selected";
    if (days.length === 7) return "every day";
    if (days.length === 1) return `every ${days[0]}`;
    const lastDay = days[days.length - 1];
    const otherDays = days.slice(0, days.length - 1).join(', ');
    return `every ${otherDays} and ${lastDay}`;
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${minutes} ${ampm}`;
  };

  const parseTime = () => {
    const [hours, minutes] = formData.callTime.split(':').map(Number);
    return {
      h: hours % 12 || 12,
      m: minutes,
      ampm: hours >= 12 ? 'PM' : 'AM'
    };
  };

  const updateTime = (unit: 'hour' | 'minute' | 'ampm', direction: 'up' | 'down' | 'toggle') => {
    let [hours, minutes] = formData.callTime.split(':').map(Number);

    if (unit === 'hour') {
      let h12 = hours % 12 || 12;
      if (direction === 'up') h12 = h12 === 12 ? 1 : h12 + 1;
      else h12 = h12 === 1 ? 12 : h12 - 1;
      if (hours >= 12) {
        hours = h12 === 12 ? 12 : h12 + 12;
      } else {
        hours = h12 === 12 ? 0 : h12;
      }
    } else if (unit === 'minute') {
      if (direction === 'up') minutes = (minutes + 5) % 60;
      else minutes = (minutes - 5 + 60) % 60;
    } else if (unit === 'ampm') {
      hours = (hours + 12) % 24;
    }

    const newTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    updateFormData('callTime', newTime);
  };

  const toggleTopicExpansion = (topicId: string) => {
    if (expandedTopic === topicId) {
      setExpandedTopic(null);
    } else {
      setExpandedTopic(topicId);
      if (!formData.interests.find(i => i.topic === topicId)) {
        setFormData(prev => ({
          ...prev,
          interests: [...prev.interests, { topic: topicId, details: '' }]
        }));
      }
    }
  };

  const removeInterest = (e: React.MouseEvent, topicId: string) => {
    e.stopPropagation();
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.filter(i => i.topic !== topicId)
    }));
    if (expandedTopic === topicId) setExpandedTopic(null);
  };

  const updateInterestDetails = (topicId: string, text: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.map(item =>
        item.topic === topicId ? { ...item, details: text } : item
      )
    }));
  };

  const isTopicSelected = (topicId: string) => formData.interests.some(i => i.topic === topicId);
  const getInterestDetail = (topicId: string) => formData.interests.find(i => i.topic === topicId)?.details || '';

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const payload = {
        senior: {
          name: formData.seniorName,
          phone: formData.seniorPhone,
          city: formData.seniorCity,
          state: formData.seniorState,
          zipCode: formData.seniorZip,
          timezone: 'America/New_York',
        },
        relation: formData.relation,
        interests: formData.interests.map(i => i.topic),
        additionalInfo: formData.additionalInfo,
        reminders: formData.reminders.filter(r => r.trim() !== ''),
        updateTopics: formData.updates,
        callSchedule: {
          days: formData.callDays,
          time: formData.callTime,
        },
        familyInfo: {
          relation: formData.relation,
          interestDetails: formData.interests.reduce((acc, i) => {
            if (i.details) acc[i.topic] = i.details;
            return acc;
          }, {} as Record<string, string>),
        },
      };

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      console.log('Submitting to:', `${apiUrl}/api/onboarding`);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(`${apiUrl}/api/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        if (contentType && contentType.includes('application/json')) {
          const err = await response.json();
          throw new Error(err.message || err.error || 'Failed to complete onboarding');
        } else {
          const text = await response.text();
          console.error('Non-JSON error response:', text);
          throw new Error(`Server error (${response.status}): ${response.statusText}`);
        }
      }

      setStep(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else if (step === 5) {
      handleSubmit();
    } else if (step === 6) {
      navigate('/dashboard');
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const stepVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4 } },
    exit: { opacity: 0, x: -50, transition: { duration: 0.4 } }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-header">
        <div className="logo">Donna</div>
        <button className="back-to-home" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Back to Home
        </button>
      </div>

      <div className="step-indicator">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`step-dot ${step === i ? 'active' : ''} ${step > i ? 'completed' : ''}`} />
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <AnimatePresence mode='wait'>
        <motion.div key={step} className="form-card" variants={stepVariants} initial="hidden" animate="visible" exit="exit">

          {step === 1 && (
            <div>
              <h2>Building the Profile</h2>
              <p className="step-description">Who will Donna be calling?</p>

              <div className="form-group">
                <label>Loved One's Name</label>
                <input type="text" placeholder="e.g. Martha" value={formData.seniorName} onChange={(e) => updateFormData('seniorName', e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label>Loved One's Phone Number</label>
                <input type="tel" placeholder="(555) 123-4567" value={formData.seniorPhone} onChange={(e) => updateFormData('seniorPhone', e.target.value)} />
              </div>
              <div className="form-group">
                <label>How Are They Related to You?</label>
                <select value={formData.relation} onChange={(e) => updateFormData('relation', e.target.value)}>
                  <option>Mother</option>
                  <option>Father</option>
                  <option>Client</option>
                  <option>Other Loved One</option>
                </select>
              </div>
              <div className="form-group">
                <label>Location</label>
                <div className="location-grid">
                  <input type="text" placeholder="City" value={formData.seniorCity} onChange={(e) => updateFormData('seniorCity', e.target.value)} />
                  <input type="text" placeholder="State" value={formData.seniorState} onChange={(e) => updateFormData('seniorState', e.target.value)} />
                  <input type="text" placeholder="Zip" value={formData.seniorZip} onChange={(e) => updateFormData('seniorZip', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2>Reminders & Updates</h2>
              <p className="step-description">Donna will begin calls by giving your loved one any reminders or updates you suggest here.</p>

              <div className="form-group">
                <label>Daily Reminders</label>
                {formData.reminders.map((reminder, index) => (
                  <input key={index} type="text" placeholder={index === 0 ? "e.g. Be sure to water the flower garden" : `Reminder ${index + 1}`} value={reminder} onChange={(e) => handleReminderChange(index, e.target.value)} style={{ marginBottom: '10px' }} />
                ))}
                <button onClick={addReminder} className="add-btn"><Plus size={16} /> Add Another Reminder</button>
                <p className="tip-text">The more detailed you make the reminders, the better!</p>
              </div>

              <div className="form-group">
                <label>Update Topics</label>
                <div className="tiles-grid">
                  {['Local Weather', 'Local News', 'Financial Markets', 'National News'].map(topic => (
                    <div key={topic} className={`topic-tile ${formData.updates.includes(topic) ? 'selected' : ''}`} onClick={() => toggleUpdate(topic)}>
                      {formData.updates.includes(topic) && <Check size={16} />} {topic}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2>What do they love to talk about?</h2>
              <p className="step-description">Select topics to help Donna spark joy and connection.</p>

              <div className="topics-grid">
                {topicCategories.map((cat) => (
                  <div key={cat.id} className={`topic-card ${expandedTopic === cat.id ? 'expanded' : ''} ${isTopicSelected(cat.id) ? 'selected' : ''}`} onClick={() => toggleTopicExpansion(cat.id)}>
                    <div className="topic-card-header">
                      {isTopicSelected(cat.id) && <button className="topic-remove-btn" onClick={(e) => removeInterest(e, cat.id)}><X size={14} color="white" /></button>}
                      <div className="topic-icon">{cat.icon}</div>
                      <div className="topic-label">{cat.id}</div>
                    </div>
                    {expandedTopic === cat.id && (
                      <div className="topic-details-form" onClick={(e) => e.stopPropagation()}>
                        <div className="topic-question">{cat.question}</div>
                        <textarea className="topic-input-area" placeholder={cat.placeholder} value={getInterestDetail(cat.id)} onChange={(e) => updateInterestDetails(cat.id, e.target.value)} autoFocus />
                        <button className="topic-done-btn" onClick={(e) => { e.stopPropagation(); setExpandedTopic(null); }}>Done</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginTop: '2rem' }}>
                <label>What else would be helpful to know?</label>
                <textarea placeholder="Additional interests, topics to avoid, favorite memories..." value={formData.additionalInfo} onChange={(e) => updateFormData('additionalInfo', e.target.value)} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2>Call Schedule</h2>
              <p className="step-description">Customize when Donna connects with your loved one.</p>

              <div className="rhythm-section">
                <h3>Check-in Days</h3>
                <div className="day-toggles">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <button key={day} className={`day-toggle-btn ${formData.callDays.includes(day) ? 'active' : ''}`} onClick={() => toggleDay(day)}>
                      <span className="day-name">{day}</span>
                      {formData.callDays.includes(day) && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rhythm-section">
                <h3>Start Time</h3>
                <div className="time-picker">
                  <div className="time-col">
                    <button className="time-btn" onClick={() => updateTime('hour', 'up')}><ChevronUp size={24} /></button>
                    <div className="time-val">{parseTime().h}</div>
                    <button className="time-btn" onClick={() => updateTime('hour', 'down')}><ChevronDown size={24} /></button>
                  </div>
                  <div className="time-sep">:</div>
                  <div className="time-col">
                    <button className="time-btn" onClick={() => updateTime('minute', 'up')}><ChevronUp size={24} /></button>
                    <div className="time-val">{parseTime().m.toString().padStart(2, '0')}</div>
                    <button className="time-btn" onClick={() => updateTime('minute', 'down')}><ChevronDown size={24} /></button>
                  </div>
                  <div className="time-col">
                    <button className="time-btn" onClick={() => updateTime('ampm', 'toggle')}><ChevronUp size={24} /></button>
                    <div className="time-val ampm">{parseTime().ampm}</div>
                    <button className="time-btn" onClick={() => updateTime('ampm', 'toggle')}><ChevronDown size={24} /></button>
                  </div>
                </div>
              </div>

              <div className="schedule-summary">
                <Star size={20} fill="#B78628" stroke="none" />
                <div>
                  <div className="summary-label">SCHEDULE SUMMARY</div>
                  <div>Donna will call <strong>{getFormattedSummary()}</strong> at <strong>{formatTime(formData.callTime)}</strong></div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2>Review & Submit</h2>
              <p className="step-description">Let's make sure everything looks right.</p>

              <div className="review-section">
                <h4>Senior Information</h4>
                <p><strong>Name:</strong> {formData.seniorName || 'Not provided'}</p>
                <p><strong>Phone:</strong> {formData.seniorPhone || 'Not provided'}</p>
                <p><strong>Relation:</strong> {formData.relation}</p>
              </div>

              <div className="review-section">
                <h4>Reminders ({formData.reminders.filter(r => r.trim()).length})</h4>
                {formData.reminders.filter(r => r.trim()).map((r, i) => <p key={i}>• {r}</p>)}
              </div>

              <div className="review-section">
                <h4>Interests ({formData.interests.length})</h4>
                <p>{formData.interests.map(i => i.topic).join(', ') || 'None selected'}</p>
              </div>

              <div className="review-section">
                <h4>Schedule</h4>
                <p>Calls <strong>{getFormattedSummary()}</strong> at <strong>{formatTime(formData.callTime)}</strong></p>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="success-view">
              <div className="success-icon"><Check size={40} strokeWidth={3} /></div>
              <h2>You're All Set!</h2>
              <p>Your loved one is now set up with Donna.</p>
              <button className="nav-btn next full-width" onClick={handleNext}>Go to Dashboard <ArrowRight size={18} /></button>
            </div>
          )}

          {step < 6 && (
            <div className="form-navigation">
              <button className="nav-btn back" onClick={handleBack} disabled={step === 1}><ArrowLeft size={16} /> Back</button>
              <button className="nav-btn next" onClick={handleNext} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : step === 5 ? 'Submit' : 'Next'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
