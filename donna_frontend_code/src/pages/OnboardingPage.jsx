import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight, ArrowLeft, Check, Plus, Star, X, Repeat, ChevronUp, ChevronDown,
    Trophy, History, Music, Film, Globe, Feather, Map, Cat, BookOpen, Flower, Plane, Utensils
} from 'lucide-react';
import './OnboardingPage.css';

const OnboardingPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);

    // Initial State
    const [formData, setFormData] = useState({
        customerName: '',
        customerEmail: '',
        seniorName: '',
        seniorPhone: '',
        relation: 'Mother',
        seniorCity: '',
        seniorState: '',
        seniorZip: '',
        interests: [], // Array of objects { topic: string, details: string }
        additionalInfo: '',
        reminders: [''],
        updates: [],
        callTime: '10:30',
        callDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // Default days
    });

    const [expandedTopic, setExpandedTopic] = useState(null);

    const totalSteps = 6;

    // --- Topic Categories Data ---
    const topicCategories = [
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

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // --- Reminder Logic ---
    const handleReminderChange = (index, value) => {
        const newReminders = [...formData.reminders];
        newReminders[index] = value;
        setFormData(prev => ({ ...prev, reminders: newReminders }));
    };

    const addReminder = () => {
        setFormData(prev => ({ ...prev, reminders: [...prev.reminders, ''] }));
    };

    // --- Updates Logic ---
    const toggleUpdate = (topic) => {
        setFormData(prev => {
            const newUpdates = prev.updates.includes(topic)
                ? prev.updates.filter(t => t !== topic)
                : [...prev.updates, topic];
            return { ...prev, updates: newUpdates };
        });
    };

    // --- Schedule Logic ---
    const toggleDay = (day) => {
        setFormData(prev => {
            const newDays = prev.callDays.includes(day)
                ? prev.callDays.filter(d => d !== day)
                : [...prev.callDays, day];
            // Sort days (Mon-Sun order)
            const dayOrder = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
            newDays.sort((a, b) => dayOrder[a] - dayOrder[b]);
            return { ...prev, callDays: newDays };
        });
    };

    const getFormattedSummary = () => {
        const days = formData.callDays;
        if (days.length === 0) return "No days selected";
        if (days.length === 7) return "every day";

        // Format list naturally
        if (days.length === 1) return `every ${days[0]} `;
        const lastDay = days[days.length - 1];
        const otherDays = days.slice(0, days.length - 1).join(', ');
        return `every ${otherDays} and ${lastDay} `;
    };

    const formatTime = (timeStr) => {
        if (!timeStr) return '';
        const [hours, minutes] = timeStr.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12; // the hour '0' should be '12'
        return `${h}:${minutes} ${ampm}`;
    };

    // Custom Time Picker Logic
    const parseTime = () => {
        const [hours, minutes] = formData.callTime.split(':').map(Number);
        return {
            h: hours % 12 || 12,
            m: minutes,
            ampm: hours >= 12 ? 'PM' : 'AM'
        };
    };

    const updateTime = (unit, direction) => {
        let [hours, minutes] = formData.callTime.split(':').map(Number);

        if (unit === 'hour') {
            let h12 = hours % 12 || 12;
            if (direction === 'up') h12 = h12 === 12 ? 1 : h12 + 1;
            else h12 = h12 === 1 ? 12 : h12 - 1;

            // Preserve AM/PM
            if (hours >= 12) { // PM
                hours = h12 === 12 ? 12 : h12 + 12;
            } else { // AM
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

    // --- Interests Logic (Progressive Disclosure) ---
    const toggleTopicExpansion = (topicId) => {
        if (expandedTopic === topicId) {
            setExpandedTopic(null); // Collapse if already open
        } else {
            setExpandedTopic(topicId); // Expand new one
            // If not already in interests array, add it
            if (!formData.interests.find(i => i.topic === topicId)) {
                setFormData(prev => ({
                    ...prev,
                    interests: [...prev.interests, { topic: topicId, details: '' }]
                }));
            }
        }
    };

    const removeInterest = (e, topicId) => {
        e.stopPropagation(); // Prevent collapse/expand trigger when clicking remove
        setFormData(prev => ({
            ...prev,
            interests: prev.interests.filter(i => i.topic !== topicId)
        }));
        if (expandedTopic === topicId) setExpandedTopic(null);
    };

    const updateInterestDetails = (topicId, text) => {
        setFormData(prev => ({
            ...prev,
            interests: prev.interests.map(item =>
                item.topic === topicId ? { ...item, details: text } : item
            )
        }));
    };

    const isTopicSelected = (topicId) => {
        return formData.interests.some(i => i.topic === topicId);
    };

    const getInterestDetail = (topicId) => {
        const item = formData.interests.find(i => i.topic === topicId);
        return item ? item.details : '';
    };

    const handleNext = () => {
        if (step < totalSteps) {
            setStep(step + 1);
        } else {
            console.log('Onboarding submitting formData:', JSON.stringify(formData, null, 2));
            navigate('/dashboard', { state: formData });
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
        <div className="container onboarding-container">
            {/* Navigation Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-sage-green)' }}>Donna</div>
                <button
                    className="back-to-home-btn"
                    onClick={() => navigate('/')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#666', fontSize: '0.9rem' }}
                >
                    <ArrowLeft size={16} /> Back to Home
                </button>
            </div>

            {/* Progress Indicator */}
            <div className="step-indicator">
                {[1, 2, 3, 4, 5].map(i => (
                    <div
                        key={i}
                        className={`step-dot ${step === i ? 'active' : ''} ${step > i ? 'completed' : ''}`}
                    />
                ))}
            </div>

            <AnimatePresence mode='wait'>
                <motion.div
                    key={step}
                    className="glass-card form-card"
                    variants={stepVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    {step === 1 && (
                        <div>
                            <h2>Welcome to Donna</h2>
                            <p style={{ marginBottom: '2rem' }}>Let's start with your details so we can keep in touch.</p>

                            <div className="form-group">
                                <label>Your Name</label>
                                <input
                                    type="text"
                                    placeholder="Jane Doe"
                                    value={formData.customerName}
                                    onChange={(e) => updateFormData('customerName', e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Your Email</label>
                                <input
                                    type="email"
                                    placeholder="jane@example.com"
                                    value={formData.customerEmail}
                                    onChange={(e) => updateFormData('customerEmail', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <h2>Building the Profile</h2>
                            <p style={{ marginBottom: '2rem' }}>Who will Donna be calling?</p>

                            <div className="form-group">
                                <label>Loved One's Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Martha"
                                    value={formData.seniorName}
                                    onChange={(e) => updateFormData('seniorName', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Loved One's Phone Number</label>
                                <input
                                    type="tel"
                                    placeholder="(555) 123-4567"
                                    value={formData.seniorPhone}
                                    onChange={(e) => updateFormData('seniorPhone', e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label>How Are They Related to You?</label>
                                <select
                                    value={formData.relation}
                                    onChange={(e) => updateFormData('relation', e.target.value)}
                                >
                                    <option>Mother</option>
                                    <option>Father</option>
                                    <option>Client</option>
                                    <option>Other Loved One</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Location</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="City"
                                        value={formData.seniorCity}
                                        onChange={(e) => updateFormData('seniorCity', e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        placeholder="State"
                                        value={formData.seniorState}
                                        onChange={(e) => updateFormData('seniorState', e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Zip"
                                        value={formData.seniorZip}
                                        onChange={(e) => updateFormData('seniorZip', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <h2>Reminders & Updates</h2>
                            <p style={{ marginBottom: '2rem', lineHeight: '1.5', color: '#666' }}>
                                Donna will begin calls by giving your loved one any reminders or updates you suggest here. You can edit these whenever you like.
                            </p>

                            {/* Dynamic Reminders */}
                            <div className="form-group">
                                <label>Daily Reminders</label>
                                {formData.reminders.map((reminder, index) => {
                                    let placeholder = `Reminder ${index + 1} `;
                                    if (index === 0) placeholder = "e.g. Be sure to water the flower garden";
                                    else if (index === 1) placeholder = "e.g. Do your 10 squats and 20 arm circles the PT recommended";
                                    else if (index === 2) placeholder = "e.g. Take out the trash before Tuesday pickup";

                                    return (
                                        <div key={index} style={{ marginBottom: '10px' }}>
                                            <input
                                                type="text"
                                                placeholder={placeholder}
                                                value={reminder}
                                                onChange={(e) => handleReminderChange(index, e.target.value)}
                                            />
                                        </div>
                                    );
                                })}
                                <button onClick={addReminder} className="add-btn">
                                    <Plus size={16} /> Add Another Reminder
                                </button>
                                <p className="tip-text">
                                    <span style={{ marginRight: '5px' }}>💡</span>
                                    The more detailed you make the reminders, the better!
                                </p>
                            </div>

                            {/* Update Topics Tiles */}
                            <div className="form-group" style={{ marginTop: '2rem' }}>
                                <label>Updates Topics</label>
                                <div className="tiles-grid">
                                    {['Local Weather', 'Local News', 'Financial Markets Update', 'National News'].map(topic => (
                                        <div
                                            key={topic}
                                            className={`topic-tile ${formData.updates.includes(topic) ? 'selected' : ''}`}
                                            onClick={() => toggleUpdate(topic)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {formData.updates.includes(topic) && <Check size={16} />}
                                                {topic}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="tip-text">
                                    <span style={{ marginRight: '5px' }}>💡</span>
                                    These are topics your loved one will get quick updates about, but they can also converse about so many more topics. Be sure to let us know their favorites on the next page.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div>
                            <h2>What do they love to talk about?</h2>
                            <p style={{ marginBottom: '2rem' }}>Select topics to help Donna spark joy and connection.</p>

                            <div className="topics-grid">
                                {topicCategories.map((cat) => (
                                    <div
                                        key={cat.id}
                                        className={`topic-card ${expandedTopic === cat.id ? 'expanded' : ''} ${isTopicSelected(cat.id) ? 'selected' : ''}`}
                                        onClick={() => toggleTopicExpansion(cat.id)}
                                    >
                                        <div className="topic-card-header">
                                            {isTopicSelected(cat.id) && (
                                                <button
                                                    className="topic-remove-btn"
                                                    onClick={(e) => removeInterest(e, cat.id)}
                                                    title="Remove interest"
                                                >
                                                    <X size={14} color="white" />
                                                </button>
                                            )}
                                            <div className="topic-icon">{cat.icon}</div>
                                            <div className="topic-label">{cat.id}</div>
                                        </div>

                                        {expandedTopic === cat.id && (
                                            <div className="topic-details-form" onClick={(e) => e.stopPropagation()}>
                                                <div className="topic-helper">Specifics help Donna hold more engaging conversations.</div>
                                                <div className="topic-question">{cat.question}</div>
                                                <textarea
                                                    className="topic-input-area"
                                                    placeholder={cat.placeholder}
                                                    value={getInterestDetail(cat.id)}
                                                    onChange={(e) => updateInterestDetails(cat.id, e.target.value)}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                                    <button
                                                        className="topic-done-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedTopic(null);
                                                        }}
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Custom Topic Card */}
                                <div className="topic-card" onClick={() => {
                                    document.getElementById('additional-info').focus();
                                }}>
                                    <div className="topic-card-header">
                                        <div className="topic-icon"><Plus size={24} /></div>
                                        <div className="topic-label">Create Custom Topic</div>
                                    </div>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginTop: '3rem', borderTop: '1px solid #eee', paddingTop: '2rem' }}>
                                <label htmlFor="additional-info">What else would be helpful to know about your loved one?</label>
                                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>Examples include additional interests, topics to avoid, or favorite memories.</p>
                                <textarea
                                    id="additional-info"
                                    placeholder="Tell us more..."
                                    value={formData.additionalInfo}
                                    onChange={(e) => updateFormData('additionalInfo', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div>
                            <h2>Call Schedule</h2>
                            <p style={{ marginBottom: '2rem' }}>Customize when Donna connects with your loved one to ensure consistent companionship.</p>

                            <div className="rhythm-section">
                                <div className="rhythm-header">
                                    <div>
                                        <h3>Check-in Days</h3>
                                        <p>Which days should Donna call?</p>
                                    </div>
                                </div>
                                <div className="day-toggles">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                        <button
                                            key={day}
                                            className={`day-toggle-btn ${formData.callDays.includes(day) ? 'active' : ''}`}
                                            onClick={() => toggleDay(day)}
                                        >
                                            <span className="day-name">{day}</span>
                                            {formData.callDays.includes(day) && <Check size={14} className="active-check" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rhythm-section">
                                <h3>Start Time</h3>
                                <p>When should the call start?</p>
                                <div className="time-picker-container-custom">
                                    {/* Hours */}
                                    <div className="time-col">
                                        <button className="time-btn" onClick={() => updateTime('hour', 'up')}><ChevronUp size={24} /></button>
                                        <div className="time-val">{parseTime().h}</div>
                                        <button className="time-btn" onClick={() => updateTime('hour', 'down')}><ChevronDown size={24} /></button>
                                    </div>
                                    <div className="time-sep">:</div>
                                    {/* Minutes */}
                                    <div className="time-col">
                                        <button className="time-btn" onClick={() => updateTime('minute', 'up')}><ChevronUp size={24} /></button>
                                        <div className="time-val">{parseTime().m.toString().padStart(2, '0')}</div>
                                        <button className="time-btn" onClick={() => updateTime('minute', 'down')}><ChevronDown size={24} /></button>
                                    </div>
                                    {/* AM/PM */}
                                    <div className="time-col ampm">
                                        <button className="time-btn" onClick={() => updateTime('ampm', 'toggle')}><ChevronUp size={24} /></button>
                                        <div className="time-val ampm-val">{parseTime().ampm}</div>
                                        <button className="time-btn" onClick={() => updateTime('ampm', 'toggle')}><ChevronDown size={24} /></button>
                                    </div>
                                </div>
                            </div>

                            <div className="schedule-summary-box">
                                <div className="sparkle-icon"><Star size={20} fill="#B78628" stroke="none" /></div>
                                <div className="summary-text">
                                    <div className="summary-label">SCHEDULE SUMMARY</div>
                                    <div>Donna is scheduled for a chat <strong>{getFormattedSummary()}</strong> at <strong>{formatTime(formData.callTime)}</strong>.</div>
                                </div>
                            </div>

                        </div>
                    )}

                    {step === 6 && (
                        <div className="success-view" style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <div className="success-icon-container" style={{
                                width: '80px', height: '80px', background: '#DCFCE7', color: '#16A34A',
                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 1.5rem auto'
                            }}>
                                <Check size={40} strokeWidth={3} />
                            </div>
                            <h2>You're All Set!</h2>
                            <p style={{ fontSize: '1.1rem', color: '#555', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem auto' }}>
                                Congratulations! You are fully onboarded and your loved one is now set up with Donna.
                            </p>

                            <button className="nav-btn next" onClick={handleNext} style={{ width: '100%', justifyContent: 'center', padding: '16px' }}>
                                Go to Dashboard <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    <div className="form-navigation">
                        {step === totalSteps ? (
                            <></> // No navigation buttons on success/final step (handled inside success view)
                        ) : (
                            step < 6 && (
                                <>
                                    <button
                                        className="nav-btn back"
                                        onClick={handleBack}
                                        disabled={step === 1}
                                        style={step === 5 ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {}}
                                    >
                                        <ArrowLeft size={16} /> Back
                                    </button>
                                    <button className="nav-btn next" onClick={handleNext}>
                                        {step === 5 ? 'Submit' : 'Next Step'} <ArrowRight size={16} />
                                    </button>
                                </>
                            )
                        )}
                    </div>
                    {step === totalSteps && (
                        <div className="footer-tip">
                            <span style={{ marginRight: '6px' }}>ℹ️</span>
                            You can reschedule call dates and times whenever you like. Recall, users are also able to call Donna themselves whenever they like!
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div >
    );
};

export default OnboardingPage;
