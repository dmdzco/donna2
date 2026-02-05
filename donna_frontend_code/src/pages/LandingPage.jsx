import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, ArrowRight, Phone, Heart, ShieldCheck, Clock, Smile, X } from 'lucide-react';
import seniorImage from '../assets/senior_on_phone.png';
import './LandingPage.css';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
    const navigate = useNavigate();
    const [isSignInOpen, setIsSignInOpen] = React.useState(false);

    // Animation Variants
    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
    };

    const stagger = {
        visible: { transition: { staggerChildren: 0.2 } }
    };

    return (
        <div className="landing-page-root">
            {/* New Capsule Navigation */}
            <nav className="navbar-capsule">
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-sage-green)' }}>Donna</div>
                <div className="nav-links">
                    <a href="#vision">Our Vision</a>
                    <a href="#how-it-works">How it Works</a>
                    <Link to="/faq">FAQ</Link>
                </div>
                <div className="nav-actions">
                    <button className="nav-signin" onClick={() => setIsSignInOpen(true)}>
                        Sign In
                    </button>
                    <Link to="/onboarding" className="nav-cta">Get Started</Link>
                </div>
            </nav>

            {/* Hero Section */}
            <header className="hero-new container">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={fadeInUp}
                    style={{ position: 'relative', zIndex: 2 }}
                >
                    <div className="hero-badge">
                        <Star size={14} fill="#4A5D4F" /> Featured on TechCrunch & Forbes
                    </div>

                    <h1 className="hero-headline">
                        The AI Companion that <br />
                        <span style={{ color: 'var(--color-sage-green)' }}>Cares Like Family.</span>
                    </h1>

                    <p className="hero-sub">
                        Donna calls your loved ones to remind them of daily tasks and chat about their day, giving them independence and you peace of mind.
                    </p>

                    <div className="cta-group">
                        <Link to="/onboarding" className="btn-primary">
                            Get Started
                        </Link>
                        <button className="btn-secondary">
                            Listen to a Call <ArrowRight size={18} style={{ display: 'inline', marginLeft: 5 }} />
                        </button>
                    </div>
                </motion.div>
            </header>

            {/* Stats Section */}
            <section className="container">
                <motion.div
                    className="stats-grid"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1 }}
                >
                    <div className="stat-item">
                        <div className="stat-number">15k+</div>
                        <div className="stat-label">Calls Made</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-number">98%</div>
                        <div className="stat-label">Family Satisfaction</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-number">24/7</div>
                        <div className="stat-label">Available Support</div>
                    </div>
                </motion.div>
            </section>

            {/* Value Prop 1: Reminders (Split Layout) */}
            <section className="container section-padding" id="vision">
                <motion.div
                    className="split-section"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeInUp}
                >
                    <div className="split-content">
                        <h2>Never Miss a Moment</h2>
                        <p>
                            From medication reminders to watering the plants, Donna ensures the little things are taken care of.
                            She speaks naturally, patiently, and kindly—never like a robot.
                        </p>
                        <ul style={{ listStyle: 'none', space: '10px' }}>
                            <li style={{ display: 'flex', gap: 10, marginBottom: 10, fontWeight: 500 }}>
                                <Clock color="#4A5D4F" /> Scheduled Daily Check-ins
                            </li>
                            <li style={{ display: 'flex', gap: 10, marginBottom: 10, fontWeight: 500 }}>
                                <ShieldCheck color="#4A5D4F" /> Instant Alerts for Issues
                            </li>
                        </ul>
                    </div>
                    <div className="split-image">
                        <img src={seniorImage} alt="Senior smiling on phone" />
                    </div>
                </motion.div>
            </section>

            {/* Value Prop 2: Companionship (Reverse Split) */}
            <section className="container section-padding">
                <motion.div
                    className="split-section reverse" // Using CSS to reverse direction
                    style={{ background: '#E8F0E8' }} // Subtle green tint for variety
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeInUp}
                >
                    <div className="split-content">
                        <h2>More Than Just Reminders</h2>
                        <p>
                            Loneliness is a health crisis. Donna is trained to have meaningful conversations about history,
                            sports, family, or whatever your loved one enjoys. It's companionship on demand.
                        </p>
                        <div style={{ fontStyle: 'italic', fontSize: '1.2rem', color: '#4A5D4F', marginTop: '1rem' }}>
                            "It feels like talking to a friend, not a machine."
                        </div>
                    </div>
                    {/* Placeholder for a second image, using the same one for now or a solid color block if no other image */}
                    <div className="split-image" style={{ background: '#fff', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px' }}>
                        <Heart size={60} color="#E8A0A0" fill="#E8A0A0" />
                    </div>
                </motion.div>
            </section>

            {/* How It Works */}
            <section className="container section-padding" id="how-it-works">
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <div className="hero-badge">How It Works</div>
                    <h2>Simple Setup. Powerful Connection.</h2>
                </div>

                <motion.div
                    className="steps-row"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={stagger}
                >
                    <motion.div className="step-card-new" variants={fadeInUp}>
                        <div className="step-icon-wrapper">
                            <Star size={24} />
                        </div>
                        <h3>1. Build a Profile</h3>
                        <p style={{ color: '#666', marginTop: '0.5rem' }}>Tell us about their interests, meds, and routine. It takes 2 minutes.</p>
                    </motion.div>

                    <motion.div className="step-card-new" variants={fadeInUp}>
                        <div className="step-icon-wrapper">
                            <Clock size={24} />
                        </div>
                        <h3>2. Set the Schedule</h3>
                        <p style={{ color: '#666', marginTop: '0.5rem' }}>Choose when Donna calls. Daily, weekly, or weekdays only.</p>
                    </motion.div>

                    <motion.div className="step-card-new" variants={fadeInUp}>
                        <div className="step-icon-wrapper">
                            <Phone size={24} />
                        </div>
                        <h3>3. Connect</h3>
                        <p style={{ color: '#666', marginTop: '0.5rem' }}>Donna starts calling. You get a daily summary of every conversation.</p>
                    </motion.div>
                </motion.div>
            </section>

            {/* Final CTA */}
            <section className="container section-padding" style={{ textAlign: 'center' }}>
                <div style={{ background: 'var(--color-sage-green)', color: 'white', borderRadius: '32px', padding: '4rem 2rem' }}>
                    <h2 style={{ color: 'white', marginBottom: '1.5rem' }}>Ready to give the gift of independence?</h2>
                    <Link to="/onboarding" className="btn-primary" style={{ display: 'inline-block', backgroundColor: 'white', color: 'var(--color-sage-green)' }}>
                        Start Your Free Trial
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="footer-simple container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--color-sage-green)' }}>Donna</div>
                    <div style={{ color: '#888' }}>&copy; {new Date().getFullYear()} Donna AI. All rights reserved.</div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <a href="#">Privacy</a>
                        <a href="#">Terms</a>
                        <a href="#">Contact</a>
                    </div>
                </div>
            </footer>


            {/* Sign In Modal */}
            {
                isSignInOpen && (
                    <div className="signin-overlay" onClick={() => setIsSignInOpen(false)}>
                        <motion.div
                            className="signin-modal"
                            onClick={e => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <button className="signin-close" onClick={() => setIsSignInOpen(false)}>
                                <X size={20} />
                            </button>

                            <h2>Welcome Back</h2>
                            <p>Enter your details to access your dashboard.</p>

                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" placeholder="name@example.com" className="signin-input" />
                            </div>

                            <div className="form-group">
                                <label>Password</label>
                                <input type="password" placeholder="••••••••" className="signin-input" />
                            </div>

                            <button className="signin-submit-btn" onClick={() => navigate('/dashboard')}>
                                Sign In
                            </button>

                            <div className="divider">or</div>

                            <button className="google-btn">
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" width="20" />
                                Sign in with Google
                            </button>
                        </motion.div>
                    </div>
                )
            }
        </div >
    );
};

export default LandingPage;
