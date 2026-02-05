import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
    Phone,
    Bell,
    LayoutDashboard,
    User,
    Settings,

    LogOut,
    CheckCircle2,
    Clock,
    Activity,
    UserCog,
    UserPlus,
    Plus,
    X,
    Trash2,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Trophy, History, Music, Film, Globe, Feather, Map, Cat, BookOpen, Flower, Plane, Utensils,
    Edit, Edit2, Check, ChevronDown, ChevronUp, Star
} from 'lucide-react';
import './DashboardPage.css';

const DashboardPage = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Debug: Log incoming state
    useEffect(() => {
        console.log('Dashboard received state:', JSON.stringify(location.state, null, 2));
    }, [location.state]);

    // Use data from onboarding if available, else mock data
    const data = location.state || {
        customerName: '',
        customerEmail: '',
        seniorName: '',
        relation: 'Mother',
        interests: [],
        updates: [],
        reminders: [],
        callTime: '09:00',
        callDays: ['Mon', 'Wed', 'Fri']
    };

    // Derive display names with fallbacks
    const caregiverName = data.customerName || 'Jane Doe';
    const caregiverEmail = data.customerEmail || 'jane.doe@example.com';
    const lovedOneName = data.seniorName || "Jane Doe's senior parent";

    // Relationship-based display name for casual references
    const getDisplayName = () => {
        if (data.relation === 'Mother') return 'Mom';
        if (data.relation === 'Father') return 'Dad';
        return lovedOneName; // For 'Client', 'Other Loved One', etc.
    };
    const displayName = getDisplayName();

    const [activeTab, setActiveTab] = useState('dashboard');
    const [profileData, setProfileData] = useState({
        name: data.customerName || 'Jane Doe',
        email: data.customerEmail || 'jane.doe@example.com',
        caregivers: []
    });

    const [seniorProfile, setSeniorProfile] = useState({
        name: data.seniorName || "Jane Doe's senior parent",
        phone: data.seniorPhone || '',
        city: data.seniorCity || '',
        state: data.seniorState || '',
        interests: (data.interests && data.interests.length > 0 ? data.interests : ['History', 'Sports', 'Music', 'Gardening', 'Politics']).map((item, index) => {
            // Handle if item is already an object or string
            const topic = typeof item === 'object' ? (item.topic || '') : item;
            const details = typeof item === 'object' ? (item.details || '') : '';
            return { id: Date.now() + index, topic, details };
        }),
        updates: data.updates && data.updates.length > 0 ? data.updates : ['Local Weather', 'Sports Scores', 'News Headlines', 'Stock Market'],
        callTime: data.callTime || '10:30',
        callDays: data.callDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], // Default to every day
        additionalInfo: data.additionalInfo || '' // Capture custom interest info
    });

    // Profile Redesign State
    const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
    const [expandedInterestId, setExpandedInterestId] = useState(null);
    const [isAddingInterest, setIsAddingInterest] = useState(false);
    const [newUpdate, setNewUpdate] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [tempInterestDetails, setTempInterestDetails] = useState('');

    // Topic Categories Data
    const topicCategories = [
        { id: 'Sports', icon: <Trophy size={20} />, placeholder: "e.g. Favorite teams, specific sports, or memorable games..." },
        { id: 'History', icon: <History size={20} />, placeholder: "e.g. Specific eras, historical figures, or world events..." },
        { id: 'Music', icon: <Music size={20} />, placeholder: "e.g. Favorite genres, artists, or classic albums..." },
        { id: 'Film', icon: <Film size={20} />, placeholder: "e.g. Favorite movies, actors, or genres..." },
        { id: 'Politics', icon: <Globe size={20} />, placeholder: "e.g. Current events, political history, or local issues..." },
        { id: 'Poetry', icon: <Feather size={20} />, placeholder: "e.g. Favorite poets, styles of poetry, or classic poems..." },
        { id: 'Geography', icon: <Map size={20} />, placeholder: "e.g. Places visited, dream destinations, or world cultures..." },
        { id: 'Animals', icon: <Cat size={20} />, placeholder: "e.g. Favorite pets, wildlife, or birdwatching..." },
        { id: 'Literature', icon: <BookOpen size={20} />, placeholder: "e.g. Favorite authors, book genres, or specific titles..." },
        { id: 'Gardening', icon: <Flower size={20} />, placeholder: "e.g. Favorite flowers, vegetables, or gardening techniques..." },
        { id: 'Travel', icon: <Plane size={20} />, placeholder: "e.g. Memorable trips, places they've lived, or future travels..." },
        { id: 'Cooking', icon: <Utensils size={20} />, placeholder: "e.g. Favorite recipes, cuisines, or holiday traditions..." },
    ];

    const getTopicIcon = (topic) => {
        const cat = topicCategories.find(c => c.id === topic);
        return cat ? cat.icon : <Activity size={20} />;
    };

    const getTopicPlaceholder = (topic) => {
        const cat = topicCategories.find(c => c.id === topic);
        return cat ? cat.placeholder : "e.g., Specific details or favorite topics...";
    };

    const handleSeniorInfoChange = (field, value) => {
        setSeniorProfile(prev => ({ ...prev, [field]: value }));
    };

    const handleAddInterest = (topic, details = '') => {
        const newInterestObj = { id: Date.now(), topic: topic, details: details };
        setSeniorProfile(prev => ({
            ...prev,
            interests: [newInterestObj, ...prev.interests]
        }));
        setIsAddingInterest(false);
        setSelectedCategory(null);
        setTempInterestDetails('');
        // Don't auto-expand if adding via panel with details
    };

    const handleUpdateInterestDetails = (index, value) => {
        setSeniorProfile(prev => {
            const newInterests = [...prev.interests];
            newInterests[index] = { ...newInterests[index], details: value };
            return { ...prev, interests: newInterests };
        });
    };

    const handleRemoveInterest = (index) => {
        setSeniorProfile(prev => ({ ...prev, interests: prev.interests.filter((_, i) => i !== index) }));
    };

    const handleAddUpdate = () => {
        if (newUpdate.trim()) {
            setSeniorProfile(prev => ({ ...prev, updates: [...prev.updates, newUpdate.trim()] }));
            setNewUpdate('');
        }
    };

    const handleRemoveUpdate = (index) => {
        setSeniorProfile(prev => ({ ...prev, updates: prev.updates.filter((_, i) => i !== index) }));
    };

    const [reminders, setReminders] = useState(data.reminders && data.reminders.length > 0 ? data.reminders : ['Take morning medication', 'Walk the dog']);

    const handleReminderChange = (index, value) => {
        const newReminders = [...reminders];
        newReminders[index] = value;
        setReminders(newReminders);
    };

    const addReminder = () => {
        setReminders([...reminders, '']);
    };

    const deleteReminder = (index) => {
        setReminders(reminders.filter((_, i) => i !== index));
    };

    const handleSaveReminders = () => {
        // In a real app, this would persist to a database
        setActiveTab('dashboard');
    };

    // Calendar events state - shared between schedule and dashboard
    const [calendarEvents, setCalendarEvents] = useState([
        { id: 3, title: 'Physical Therapy', time: '13:00', date: '2023-10-25', repeat: false, notes: '' },
        { id: 4, title: 'Tigers Game Start', time: '16:00', date: '2023-10-24', repeat: false, notes: '' },
        { id: 5, title: 'Tigers Game Start', time: '17:30', date: '2023-10-25', repeat: false, notes: '' }
    ]);

    // Schedule state
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isAddingCall, setIsAddingCall] = useState(false);
    const [newCall, setNewCall] = useState({
        title: '',
        date: '',
        time: '09:00',
        repeat: false,
        repeatFrequency: 'weekly',
        notes: ''
    });

    // Get current week dates
    const getWeekDates = () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            dates.push(date);
        }
        return dates;
    };

    const weekDates = getWeekDates();
    // 24 Hour Time Slots
    const timeSlots = [];
    for (let i = 0; i < 24; i++) {
        const hour = i === 0 ? 12 : (i > 12 ? i - 12 : i);
        const ampm = i < 12 ? 'AM' : 'PM';
        timeSlots.push(`${hour} ${ampm}`);
    }

    const formatTime12Hour = (timeStr) => {
        if (!timeStr) return '';
        const [hourStr, minStr] = timeStr.split(':');
        let hour = parseInt(hourStr);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12;
        hour = hour ? hour : 12; // the hour '0' should be '12'
        return `${hour}:${minStr} ${ampm}`;
    };

    const scrollRef = useRef(null);

    useEffect(() => {
        if (activeTab === 'schedule' && scrollRef.current) {
            // Scroll to 8 AM (approx 8 * 60px row height + header)
            // Or just calculate percentage. 8 AM is 8/24 = 33% down
            // But let's just set a pixel value assuming standard row height
            // 8th slot * approx height
            const rowHeight = 80; // Estimate
            scrollRef.current.scrollTop = 8 * rowHeight;
        }
    }, [activeTab]);

    const formatDateForComparison = (date) => {
        return date.toISOString().split('T')[0];
    };

    const getEventsForSlot = (date, hour) => {
        const dateStr = formatDateForComparison(date);

        // 1. Dynamic Check-Ins
        let dynamicEvents = [...calendarEvents];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const callTime = seniorProfile.callTime || '09:00';

        if (seniorProfile.callDays && seniorProfile.callDays.includes(dayName)) {
            const hasOverride = calendarEvents.some(e =>
                e.date === dateStr && e.title === 'Daily Check In'
            );

            if (!hasOverride) {
                dynamicEvents.push({
                    id: `checkin-${dateStr}`,
                    title: 'Daily Check In',
                    time: callTime,
                    date: dateStr,
                    type: 'call',
                    repeat: false // It's generated dynamically, so we treat it as single instance here
                });
            }
        }

        return dynamicEvents.filter(event => {
            const eventHour = parseInt(event.time.split(':')[0]);
            // Check for exact date match
            if (event.date === dateStr && eventHour === hour) return true;
            // Check for recurring events
            if (event.repeat) {
                const eventDate = new Date(event.date);
                // Adjust for timezone offset to ensure correct day comparison if needed, 
                // but for simple string comparison:
                const dayMatch = eventDate.getDay() === date.getDay();

                // DAILY REPEAT CHECK
                const isDaily = event.repeatFrequency === 'daily';

                // We also need to make sure the event started on or before this date
                const isAfterStart = new Date(dateStr) >= new Date(event.date);

                if (isDaily && isAfterStart && eventHour === hour) return true;
                if (!isDaily && dayMatch && isAfterStart && eventHour === hour) return true;
                return false;
            }
            return false;
        });
    };

    // Helper functions for Dashboard View
    const isSameDay = (d1, d2) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const isSameDayOfWeek = (d1, dayIndex) => {
        return d1.getDay() === dayIndex;
    };

    const getEventsForDay = (targetDate) => {
        const targetDateStr = formatDateForComparison(targetDate);

        // 1. Dynamic Check-Ins based on Onboarding Schedule
        let dynamicEvents = [...calendarEvents];

        // Generate dynamic check-in event if day matches
        const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'short' }); // "Mon", "Tue"
        const callTime = seniorProfile.callTime || '09:00'; // Default to 9am if missing

        if (seniorProfile.callDays && seniorProfile.callDays.includes(dayName)) {
            // Check if there isn't already a manual check-in override for this specific date
            // (Assuming manual overrides would be in calendarEvents with same title/date)
            const hasOverride = calendarEvents.some(e =>
                e.date === targetDateStr && e.title === 'Daily Check In'
            );

            if (!hasOverride) {
                dynamicEvents.push({
                    id: `checkin-${targetDateStr}`,
                    title: 'Daily Check In',
                    time: callTime,
                    date: targetDateStr,
                    type: 'call',
                    status: 'scheduled'
                });
            }
        }

        return dynamicEvents.filter(event => {
            // 1. Exact Date Match
            if (event.date === targetDateStr) return true;

            // 2. Recurring Match (Legacy/Manual events)
            if (event.repeat) {
                const eventStartDate = new Date(event.date);
                const isAfterStart = new Date(targetDateStr) >= eventStartDate;

                if (!isAfterStart) return false;

                if (event.repeatFrequency === 'daily') return true;

                // Must be same day of week
                return eventStartDate.getDay() === targetDate.getDay();
            }
            return false;
        }).sort((a, b) => {
            // Sort by time
            // Handle time format "HH:MM" comparison
            // Normalize "9:00" to "09:00" for string compare if needed, but standard ISO is fine
            return a.time.localeCompare(b.time);
        });
    };

    const todayDate = new Date();
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(todayDate.getDate() + 1);

    const todayEvents = getEventsForDay(todayDate);
    const tomorrowEvents = getEventsForDay(tomorrowDate);

    const handleSaveCall = () => {
        if (newCall.title && newCall.date && newCall.time) {
            const newEvent = {
                id: Date.now(),
                ...newCall
            };
            setCalendarEvents([...calendarEvents, newEvent]);
            setNewCall({ title: '', date: '', time: '09:00', repeat: false, repeatFrequency: 'weekly', notes: '' });
            setIsAddingCall(false);
        }
    };

    const handleDeleteEvent = (eventId) => {
        setCalendarEvents(calendarEvents.filter(e => e.id !== eventId));
        setSelectedEvent(null);
    };

    const handleSignOut = () => {
        navigate('/');
    };

    const handleAddCaregiver = () => {
        const email = prompt('Enter caregiver email:');
        if (email) {
            setProfileData(prev => ({
                ...prev,
                caregivers: [...prev.caregivers, { email, name: 'New Caregiver' }]
            }));
        }
    };

    return (
        <div className="dashboard-container">
            {/* Sidebar Navigation */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <div style={{ width: 32, height: 32, background: 'var(--color-sage-green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <var style={{ color: 'white', fontStyle: 'normal' }}>D</var>
                    </div>
                    Donna
                </div>

                <nav className="nav-menu">
                    <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <LayoutDashboard size={20} /> Dashboard
                    </div>
                    <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                        <User size={20} /> Profile
                    </div>
                    <div className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => alert('Coming Soon!')}>
                        <History size={20} /> History
                    </div>
                    <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                        <Settings size={20} /> Settings
                    </div>
                </nav>

                <div className="user-profile-mini" onClick={() => setActiveTab('caregiverProfile')}>
                    <div className="user-avatar-mini"></div>
                    <div className="user-info-mini">
                        <h4>{caregiverName}</h4>
                        <span>Primary Caregiver</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                {activeTab === 'dashboard' && (
                    <>
                        <div className="dashboard-header">
                            <h1>Good Evening, {caregiverName.split(' ')[0]}.</h1>
                        </div>

                        {/* Actions Grid */}
                        <div className="actions-grid">
                            <div className="action-card">
                                <div className="action-icon">
                                    <Phone size={24} />
                                </div>
                                <div className="action-card-content">
                                    <h3>Instant Check-in</h3>
                                    <p>Trigger a voice call now</p>
                                </div>
                            </div>

                            <div className="action-card" onClick={() => setActiveTab('reminders')}>
                                <div className="action-icon">
                                    <Bell size={24} />
                                </div>
                                <div className="action-card-content">
                                    <h3>Edit Reminders</h3>
                                    <p>Make adjustments to daily reminders</p>
                                </div>
                            </div>
                        </div>

                        {/* Split Content Grid */}
                        <div className="content-grid">
                            {/* Calendar Section */}
                            <section>
                                <div className="section-header">
                                    <h2>Calendar - Today & Tomorrow</h2>
                                    <button className="edit-link" onClick={() => setActiveTab('schedule')}>Edit Calendar</button>
                                </div>
                                <div className="calendar-card">
                                    <div className="day-section">
                                        <div className="day-header">Today</div>
                                        <div className="day-date">{todayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>

                                        {todayEvents.length > 0 ? (
                                            todayEvents.map(event => (
                                                <div key={event.id} className="event-item" style={{ borderLeftColor: event.title === 'Daily Check In' ? 'var(--color-sage-green)' : '#888' }}>
                                                    <div>
                                                        <div className="event-time">{formatTime12Hour(event.time)}</div>
                                                        <div className="event-title">{event.title}</div>
                                                    </div>
                                                    <div className="event-status" style={{ color: event.title === 'Daily Check In' ? 'var(--color-sage-green)' : '#ccc' }}>
                                                        {event.title === 'Daily Check In' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="empty-state" style={{ padding: '1rem', marginTop: '1rem' }}>No events scheduled for today.</div>
                                        )}
                                    </div>

                                    <div className="day-section">
                                        <div className="day-header">Tomorrow</div>
                                        <div className="day-date">{tomorrowDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>

                                        {tomorrowEvents.length > 0 ? (
                                            tomorrowEvents.map(event => (
                                                <div key={event.id} className="event-item" style={{ borderLeftColor: event.title === 'Daily Check In' ? 'var(--color-sage-green)' : '#888' }}>
                                                    <div>
                                                        <div className="event-time">{formatTime12Hour(event.time)}</div>
                                                        <div className="event-title">{event.title}</div>
                                                    </div>
                                                    <div className="event-status" style={{ color: event.title === 'Daily Check In' ? 'var(--color-sage-green)' : '#ccc' }}>
                                                        {event.title === 'Daily Check In' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="empty-state" style={{ padding: '1rem', marginTop: '1rem' }}>No events scheduled for tomorrow.</div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* Recent Activity Section */}
                            <section>
                                <div className="section-header">
                                    <h2>Recent Activity</h2>
                                </div>
                                <div className="activity-card">
                                    <div className="timeline">
                                        {/* Last Call Item */}
                                        <div className="timeline-item">
                                            <div className="timeline-dot dot-blue"></div>
                                            <div className="timeline-header">
                                                <span>Last Call</span>
                                                <span>9:00 AM</span>
                                            </div>
                                            <div className="sentiment-card">
                                                <div className="sentiment-header">
                                                    <Activity size={16} /> Positive Sentiment
                                                </div>
                                                <div className="sentiment-body">
                                                    {displayName} was excited about the Lions' win today. Sounded energetic and engaged.
                                                </div>
                                            </div>
                                        </div>

                                        {/* Weekly Summary Item */}
                                        <div className="timeline-item">
                                            <div className="timeline-dot dot-green"></div>
                                            <div className="timeline-header">
                                                <span>Summary - Last 7 Days</span>
                                            </div>
                                            <div className="sentiment-card">
                                                <div className="sentiment-header">
                                                    <Activity size={16} /> Positive Sentiment
                                                </div>
                                                <div className="sentiment-body">
                                                    {displayName} answered 6 out of 9 calls and has generally been happy. One complaint surfaced was that the apartment was very hot last Wednesday.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </>
                )}

                {activeTab === 'profile' && (
                    <div className="profile-container-redesign">
                        <div className="profile-header-simple">
                            <h1>Profile</h1>
                            <p>View and edit information about your loved one</p>
                        </div>

                        {/* Basic Information Section - Snippet Integrated */}
                        <div className="profile-section-card">
                            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                <h2 className="section-title">Basic Information</h2>
                                {!isEditingBasicInfo ? (
                                    <button
                                        onClick={() => setIsEditingBasicInfo(true)}
                                        className="edit-outline-btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '2px solid rgba(30,58,95,0.2)', color: '#1E3A5F', background: 'transparent' }}
                                    >
                                        <Edit2 size={16} /> Edit
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setIsEditingBasicInfo(false)}
                                        className="save-outline-btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '2px solid rgba(30,58,95,0.2)', color: '#1E3A5F', background: 'transparent' }}
                                    >
                                        <Check size={16} /> Save
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }} className="md:grid-cols-2">
                                {/* Name */}
                                <div>
                                    <label style={{ display: 'block', color: '#5A6C7D', marginBottom: '0.5rem' }}>Loved One's Name</label>
                                    {!isEditingBasicInfo ? (
                                        <div className="info-field-read">{seniorProfile.name}</div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={seniorProfile.name}
                                            onChange={(e) => handleSeniorInfoChange('name', e.target.value)}
                                            className="info-field-edit"
                                            placeholder="e.g. Martha"
                                        />
                                    )}
                                </div>

                                {/* Phone */}
                                <div>
                                    <label style={{ display: 'block', color: '#5A6C7D', marginBottom: '0.5rem' }}>Phone Number</label>
                                    {!isEditingBasicInfo ? (
                                        <div className="info-field-read">{seniorProfile.phone || '(555) 123-4567'}</div>
                                    ) : (
                                        <input
                                            type="tel"
                                            value={seniorProfile.phone}
                                            onChange={(e) => handleSeniorInfoChange('phone', e.target.value)}
                                            className="info-field-edit"
                                            placeholder="(555) 123-4567"
                                        />
                                    )}
                                </div>

                                {/* Relationship */}
                                <div>
                                    <label style={{ display: 'block', color: '#5A6C7D', marginBottom: '0.5rem' }}>Relationship</label>
                                    {!isEditingBasicInfo ? (
                                        <div className="info-field-read">{data.relation || 'Mother'}</div>
                                    ) : (
                                        <select className="info-field-edit" style={{ background: 'white' }}>
                                            <option>Mother</option>
                                            <option>Father</option>
                                            <option>Client</option>
                                            <option>Other Loved One</option>
                                        </select>
                                    )}
                                </div>

                                {/* Location - Spans 2 cols on md */}
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', color: '#5A6C7D', marginBottom: '0.5rem' }}>Location</label>
                                    {!isEditingBasicInfo ? (
                                        <div className="info-field-read">
                                            {seniorProfile.city ? `${seniorProfile.city}, ${seniorProfile.state} ${seniorProfile.zip || ''}` : 'Detroit, Michigan 48201'}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                                            <input
                                                type="text"
                                                value={seniorProfile.city}
                                                onChange={(e) => handleSeniorInfoChange('city', e.target.value)}
                                                className="info-field-edit"
                                                placeholder="City"
                                            />
                                            <input
                                                type="text"
                                                value={seniorProfile.state}
                                                onChange={(e) => handleSeniorInfoChange('state', e.target.value)}
                                                className="info-field-edit"
                                                placeholder="State"
                                            />
                                            <input
                                                type="text"
                                                value={seniorProfile.zip || ''}
                                                onChange={(e) => handleSeniorInfoChange('zip', e.target.value)}
                                                className="info-field-edit"
                                                placeholder="Zip"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Interests Section - Snippet Integrated */}
                        <div className="profile-section-card">
                            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                <div>
                                    <h2 className="section-title">Interests</h2>
                                    <p className="section-subtitle">Topics they love to talk about</p>
                                </div>
                                {!isAddingInterest && (
                                    <button
                                        onClick={() => setIsAddingInterest(true)}
                                        className="add-interest-btn-integrated"
                                    >
                                        <Plus size={16} /> Add Interest
                                    </button>
                                )}
                            </div>

                            {/* Add Interest Panel (Integrated) */}
                            {isAddingInterest && (
                                <div className="add-interest-panel-integrated">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: 'white' }}>
                                        <h3 style={{ fontWeight: 600 }}>Add New Interest</h3>
                                        <button
                                            onClick={() => { setIsAddingInterest(false); setTempInterestDetails(''); setSelectedCategory(null); }}
                                            className="action-btn"
                                            style={{ color: 'white' }}
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>Select Category</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.75rem' }}>
                                            {topicCategories
                                                .filter(cat => !seniorProfile.interests.some(existing => existing.topic === cat.id))
                                                .map(cat => (
                                                    <button
                                                        key={cat.id}
                                                        onClick={() => setSelectedCategory(cat.id)}
                                                        className={`category-tile ${selectedCategory === cat.id ? 'selected' : ''}`}
                                                    >
                                                        {getTopicIcon(cat.id)}
                                                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{cat.id}</span>
                                                    </button>
                                                ))}

                                            {/* Custom Interest Option */}
                                            {!seniorProfile.additionalInfo && (
                                                <button
                                                    onClick={() => {
                                                        setSeniorProfile(prev => ({ ...prev, additionalInfo: ' ' }));
                                                        setExpandedInterestId('custom-interest');
                                                        setIsAddingInterest(false);
                                                        setSelectedCategory(null);
                                                        setTempInterestDetails('');
                                                    }}
                                                    className="category-tile"
                                                >
                                                    <Star size={20} />
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Custom Interest</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {selectedCategory && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                                                Add specific details (optional)
                                            </label>
                                            <textarea
                                                className="integrated-textarea"
                                                placeholder={getTopicPlaceholder(selectedCategory)}
                                                value={tempInterestDetails}
                                                onChange={(e) => setTempInterestDetails(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleAddInterest(selectedCategory, tempInterestDetails)}
                                        disabled={!selectedCategory}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '0.5rem',
                                            fontWeight: 500,
                                            border: 'none',
                                            cursor: !selectedCategory ? 'not-allowed' : 'pointer',
                                            background: !selectedCategory ? 'rgba(255,255,255,0.2)' : 'white',
                                            color: !selectedCategory ? 'rgba(255,255,255,0.5)' : '#5A6C7D'
                                        }}
                                    >
                                        Add Interest
                                    </button>
                                </div>
                            )}

                            {/* Existing Interests List */}
                            <div className="interests-list-stack">
                                {seniorProfile.interests.length === 0 && !isAddingInterest && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#5A6C7D' }}>
                                        No interests added yet. Click "Add Interest" to get started.
                                    </div>
                                )}

                                {seniorProfile.interests.map((interest, index) => {
                                    const isExpanded = expandedInterestId === interest.id;
                                    return (
                                        <div key={interest.id} className={`interest-card-integrated ${isExpanded ? 'expanded' : 'collapsed'}`}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                                                    <div className="icon-box">
                                                        {getTopicIcon(interest.topic)}
                                                    </div>
                                                    <div style={{ flex: 1 }} onClick={() => setExpandedInterestId(isExpanded ? null : interest.id)}>
                                                        <div className="card-title">{interest.topic}</div>
                                                        {!isExpanded && interest.details && (
                                                            <div className="card-detail">
                                                                {interest.details.length > 50 ? interest.details.substring(0, 50) + '...' : interest.details}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => setExpandedInterestId(isExpanded ? null : interest.id)}
                                                        className="action-btn"
                                                    >
                                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveInterest(index)}
                                                        className="action-btn delete-btn"
                                                    >
                                                        <X size={20} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded Body */}
                                            {isExpanded && (
                                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                                                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                                                        Specifics help Donna hold more engaging conversations.
                                                    </label>
                                                    <textarea
                                                        className="integrated-textarea"
                                                        value={interest.details}
                                                        onChange={(e) => handleUpdateInterestDetails(index, e.target.value)}
                                                        placeholder={getTopicPlaceholder(interest.topic)}
                                                        rows={3}
                                                        autoFocus
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                                        <button
                                                            className="done-btn-integrated"
                                                            onClick={() => setExpandedInterestId(null)}
                                                        >
                                                            Done
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Custom Interest Tile (Additional Info) */}
                                {seniorProfile.additionalInfo && (
                                    <div className={`interest-card-integrated ${expandedInterestId === 'custom-interest' ? 'expanded' : 'collapsed'}`}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                                                <div className="icon-box">
                                                    <Star size={20} />
                                                </div>
                                                <div style={{ flex: 1 }} onClick={() => setExpandedInterestId(expandedInterestId === 'custom-interest' ? null : 'custom-interest')}>
                                                    <div className="card-title">Custom Interest</div>
                                                    {expandedInterestId !== 'custom-interest' && (
                                                        <div className="card-detail">
                                                            {seniorProfile.additionalInfo.length > 50 ? seniorProfile.additionalInfo.substring(0, 50) + '...' : seniorProfile.additionalInfo}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => setExpandedInterestId(expandedInterestId === 'custom-interest' ? null : 'custom-interest')}
                                                    className="action-btn"
                                                >
                                                    {expandedInterestId === 'custom-interest' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                </button>
                                            </div>
                                        </div>

                                        {expandedInterestId === 'custom-interest' && (
                                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                                                <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                                                    Additional notes or custom topics provided during onboarding.
                                                </label>
                                                <textarea
                                                    className="integrated-textarea"
                                                    value={seniorProfile.additionalInfo}
                                                    onChange={(e) => handleSeniorInfoChange('additionalInfo', e.target.value)}
                                                    rows={3}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                                    <button
                                                        className="done-btn-integrated"
                                                        onClick={() => setExpandedInterestId(null)}
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Updates Section - Snippet Integrated (Tile Grid) */}
                        <div className="section-card updates-section-card">
                            <div className="card-header-row" style={{ marginBottom: '1rem' }}>
                                <div>
                                    <h2 className="section-title">Updates</h2>
                                    <p className="section-subtitle">Topics for brief daily updates</p>
                                </div>
                            </div>

                            <div className="updates-grid-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                {['Local Weather', 'Local News', 'Financial Markets Update', 'National News'].map((topic) => {
                                    const isSelected = seniorProfile.updates.includes(topic);
                                    return (
                                        <div
                                            key={topic}
                                            className={`update-tile-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => {
                                                const currentUpdates = [...seniorProfile.updates];
                                                if (isSelected) {
                                                    handleSeniorInfoChange('updates', currentUpdates.filter(t => t !== topic));
                                                } else {
                                                    handleSeniorInfoChange('updates', [...currentUpdates, topic]);
                                                }
                                            }}
                                            style={{
                                                background: isSelected ? 'var(--color-sage-green)' : 'white',
                                                color: isSelected ? 'white' : '#1E3A5F',
                                                border: isSelected ? '2px solid var(--color-sage-green)' : '2px solid rgba(30,58,95,0.1)',
                                                borderRadius: '12px',
                                                padding: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                cursor: 'pointer',
                                                fontWeight: 500,
                                                textAlign: 'center',
                                                transition: 'all 0.2s',
                                                minHeight: '80px'
                                            }}
                                        >
                                            {isSelected && <Check size={18} />}
                                            {topic}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}










                {
                    activeTab === 'caregiverProfile' && (
                        <div className="profile-view">
                            <div className="profile-header">
                                <h1>My Account</h1>
                                <button className="signout-btn" onClick={handleSignOut}>
                                    <LogOut size={18} /> Sign Out
                                </button>
                            </div>

                            <div className="profile-card">
                                <div className="form-section">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        value={profileData.name}
                                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                                        className="profile-input"
                                    />
                                </div>

                                <div className="form-section">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={profileData.email}
                                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                                        className="profile-input"
                                    />
                                </div>

                                <div className="form-section">
                                    <div className="section-header-inline">
                                        <label>Additional Caregivers</label>
                                        <button className="add-caregiver-btn" onClick={handleAddCaregiver}>
                                            <UserPlus size={18} /> Add Caregiver
                                        </button>
                                    </div>
                                    {profileData.caregivers.length > 0 ? (
                                        <div className="caregivers-list">
                                            {profileData.caregivers.map((caregiver, index) => (
                                                <div key={index} className="caregiver-item">
                                                    <div className="caregiver-avatar">
                                                        {caregiver.email.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="caregiver-info">
                                                        <div className="caregiver-name">{caregiver.name}</div>
                                                        <div className="caregiver-email">{caregiver.email}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            No additional caregivers added yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    activeTab === 'schedule' && (
                        <div className="schedule-container">
                            {/* Schedule Header */}
                            <div className="schedule-header">
                                <div>
                                    <h1>Weekly Schedule</h1>
                                    <p className="schedule-subtitle">Manage when Donna initiates calls with {displayName}. Drag and drop to reschedule.</p>
                                </div>
                                <div className="schedule-actions">
                                    <div className="view-toggle">
                                        <button className="toggle-btn active">Week</button>
                                        <button className="toggle-btn">Month</button>
                                    </div>
                                    <button className="add-call-btn" onClick={() => { setIsAddingCall(true); setSelectedEvent(null); }}>
                                        <Plus size={18} /> Add Call Window
                                    </button>
                                </div>
                            </div>

                            <div className="schedule-content">
                                {/* Weekly Calendar Grid */}
                                <div className="weekly-calendar">
                                    {/* Day Headers */}
                                    <div className="week-header">
                                        <div className="time-gutter"></div>
                                        {weekDates.map((date, index) => {
                                            const today = new Date();
                                            const isToday = date.toDateString() === today.toDateString();
                                            const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                                            return (
                                                <div key={index} className={`day-column-header ${isToday ? 'today' : ''}`}>
                                                    <span className="day-name">{dayNames[date.getDay()]}</span>
                                                    <span className={`day-number ${isToday ? 'today-number' : ''}`}>{date.getDate()}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Time Grid */}
                                    <div className="time-grid" ref={scrollRef}>
                                        {timeSlots.map((slot, slotIndex) => {
                                            const hour = slotIndex; // Use 0-23 directly
                                            return (
                                                <div key={slot} className="time-row">
                                                    <div className="time-label">{slot}</div>
                                                    {weekDates.map((date, dayIndex) => {
                                                        const events = getEventsForSlot(date, hour);
                                                        const today = new Date();
                                                        const isToday = date.toDateString() === today.toDateString();
                                                        return (
                                                            <div key={dayIndex} className={`day-cell ${isToday ? 'today-column' : ''}`}>
                                                                {events.map(event => (
                                                                    <div
                                                                        key={event.id}
                                                                        className="call-event"
                                                                        onClick={() => { setSelectedEvent(event); setIsAddingCall(false); }}
                                                                    >
                                                                        <div className="call-event-title">{event.title}</div>
                                                                        <div className="call-event-time">{formatTime12Hour(event.time)}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Call Details Panel */}
                                {(isAddingCall || selectedEvent) && (
                                    <div className="call-details-panel">
                                        <div className="panel-header">
                                            <h3>Call Details</h3>
                                            <div className="panel-actions">
                                                {selectedEvent && (
                                                    <button className="icon-btn" onClick={() => handleDeleteEvent(selectedEvent.id)}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                                <button className="icon-btn" onClick={() => { setSelectedEvent(null); setIsAddingCall(false); }}>
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="panel-form">
                                            <div className="form-group">
                                                <label>CALL PURPOSE</label>
                                                <input
                                                    type="text"
                                                    placeholder="PT Reminder"
                                                    value={isAddingCall ? newCall.title : (selectedEvent?.title || '')}
                                                    onChange={(e) => isAddingCall
                                                        ? setNewCall({ ...newCall, title: e.target.value })
                                                        : setSelectedEvent({ ...selectedEvent, title: e.target.value })
                                                    }
                                                    className="panel-input"
                                                />
                                            </div>

                                            <div className="form-group">
                                                <label>DATE</label>
                                                <div className="date-input-wrapper">
                                                    <Calendar size={16} />
                                                    <input
                                                        type="date"
                                                        value={isAddingCall ? newCall.date : (selectedEvent?.date || '')}
                                                        onChange={(e) => isAddingCall
                                                            ? setNewCall({ ...newCall, date: e.target.value })
                                                            : setSelectedEvent({ ...selectedEvent, date: e.target.value })
                                                        }
                                                        className="panel-input"
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label>CALL TIME</label>
                                                <div className="time-input-wrapper">
                                                    <input
                                                        type="time"
                                                        value={isAddingCall ? newCall.time : (selectedEvent?.time || '')}
                                                        onChange={(e) => isAddingCall
                                                            ? setNewCall({ ...newCall, time: e.target.value })
                                                            : setSelectedEvent({ ...selectedEvent, time: e.target.value })
                                                        }
                                                        className="panel-input"
                                                    />
                                                    <Clock size={16} />
                                                </div>
                                            </div>

                                            <div className="form-group toggle-group">
                                                <div>
                                                    <label>Repeat Call</label>
                                                    <span className="toggle-sublabel">Enable recurring schedule</span>
                                                </div>
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={isAddingCall ? newCall.repeat : (selectedEvent?.repeat || false)}
                                                        onChange={(e) => isAddingCall
                                                            ? setNewCall({ ...newCall, repeat: e.target.checked })
                                                            : setSelectedEvent({ ...selectedEvent, repeat: e.target.checked })
                                                        }
                                                    />
                                                    <span className="toggle-slider"></span>
                                                </label>
                                            </div>

                                            {(isAddingCall ? newCall.repeat : selectedEvent?.repeat) && (
                                                <div className="form-group">
                                                    <label>FREQUENCY</label>
                                                    <div className="frequency-selector">
                                                        <button
                                                            className={`freq-btn ${(isAddingCall ? newCall.repeatFrequency : selectedEvent?.repeatFrequency) === 'daily' ? 'active' : ''}`}
                                                            onClick={() => isAddingCall
                                                                ? setNewCall({ ...newCall, repeatFrequency: 'daily' })
                                                                : setSelectedEvent({ ...selectedEvent, repeatFrequency: 'daily' })
                                                            }
                                                        >
                                                            Daily
                                                        </button>
                                                        <button
                                                            className={`freq-btn ${(isAddingCall ? newCall.repeatFrequency === 'weekly' || !newCall.repeatFrequency : selectedEvent?.repeatFrequency === 'weekly' || !selectedEvent?.repeatFrequency) ? 'active' : ''}`}
                                                            onClick={() => isAddingCall
                                                                ? setNewCall({ ...newCall, repeatFrequency: 'weekly' })
                                                                : setSelectedEvent({ ...selectedEvent, repeatFrequency: 'weekly' })
                                                            }
                                                        >
                                                            Weekly
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="form-group">
                                                <label>CONTEXT NOTES</label>
                                                <textarea
                                                    placeholder="Add context for Donna (e.g., Remind Eleanor she has a physical therapy appointment at 4:30...)"
                                                    value={isAddingCall ? newCall.notes : (selectedEvent?.notes || '')}
                                                    onChange={(e) => isAddingCall
                                                        ? setNewCall({ ...newCall, notes: e.target.value })
                                                        : setSelectedEvent({ ...selectedEvent, notes: e.target.value })
                                                    }
                                                    className="panel-textarea"
                                                />
                                            </div>

                                            <button className="save-changes-btn" onClick={isAddingCall ? handleSaveCall : () => setSelectedEvent(null)}>
                                                Save Changes
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    activeTab === 'reminders' && (
                        <div className="reminders-view">
                            <div className="view-header">
                                <div>
                                    <h1>Daily Reminders</h1>
                                    <p className="view-subtitle">These are the points Donna will mention during her check-ins with {displayName}.</p>
                                </div>
                                <button className="add-btn" onClick={addReminder}>
                                    <Plus size={18} /> Add Reminder
                                </button>
                            </div>

                            <div className="reminders-card">
                                <div className="reminders-list">
                                    {reminders.map((reminder, index) => (
                                        <div key={index} className="reminder-item-row">
                                            <div className="reminder-input-wrapper">
                                                <Bell size={18} className="reminder-icon" />
                                                <input
                                                    type="text"
                                                    value={reminder}
                                                    onChange={(e) => handleReminderChange(index, e.target.value)}
                                                    placeholder="e.g., Take evening medication"
                                                    className="reminder-input"
                                                />
                                            </div>
                                            <button className="delete-reminder-btn" onClick={() => deleteReminder(index)}>
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                    {reminders.length === 0 && (
                                        <div className="empty-reminders">
                                            <p>No reminders set. Add one to help Donna support {displayName}.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="view-footer">
                                    <button className="cancel-btn" onClick={() => setActiveTab('dashboard')}>Cancel</button>
                                    <button className="save-btn" onClick={handleSaveReminders}>Save Changes</button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </main >
        </div >
    );
};

export default DashboardPage;
