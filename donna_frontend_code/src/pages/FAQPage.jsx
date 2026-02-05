import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import './FAQPage.css';

const FAQPage = () => {
    // FAQ Data - Rebranded from Meela to Donna
    const faqs = [
        {
            category: "Getting Started",
            items: [
                {
                    q: "How do I sign up?",
                    a: "Getting started with Donna is quick and easy! Just verify your loved one's profile details in our onboarding process, and we'll handle the rest."
                },
                {
                    q: "Is there any equipment I need?",
                    a: "No! Donna connects with members through scheduled phone calls—there’s no need for any new device, app, or technology. At the scheduled time, Donna calls the member's regular phone (cell or landline), and all they have to do is pick up and talk."
                },
                {
                    q: "What if my loved one is hesitant?",
                    a: "It’s very common for people to feel unsure at first. We recommend inviting them to try just one call. Donna’s conversations are designed to be natural, easy, and low-pressure. Many who were hesitant at first end up enjoying the experience the most once they’ve tried it."
                }
            ]
        },
        {
            category: "How Donna Works",
            items: [
                {
                    q: "Is Donna a real person?",
                    a: "No, Donna is powered by advanced artificial intelligence (AI). However, she speaks naturally, remembers details from past conversations, and engages in meaningful discussions essentially like a brilliant companion who never gets tired."
                },
                {
                    q: "What can I talk to Donna about?",
                    a: "Anything! Donna loves to chat about your life (family, childhood, career), your interests (music, sports, history, books), or just how you're feeling. She's also great for trivia or quick questions!"
                },
                {
                    q: "Does Donna remember our conversations?",
                    a: "Yes! Donna learns from conversations over time. She remembers hobbies, interests, family members, and favorite topics, so every conversation feels personal and builds on the last one."
                }
            ]
        },
        {
            category: "Privacy & Safety",
            items: [
                {
                    q: "Are conversations private?",
                    a: "Your conversations stay private. Donna does not share personal conversations with others. Important messages, such as those expressing health concerns or immediate care-related issues, are privately relayed to the relevant family members or care team."
                },
                {
                    q: "Is Donna an emergency service?",
                    a: "No. Donna is not designed for emergency response. In the event of a medical emergency, please call 911 or your local emergency services."
                }
            ]
        }
    ];

    const [activeIndex, setActiveIndex] = useState(null);

    const toggleAccordion = (index) => {
        setActiveIndex(activeIndex === index ? null : index);
    };

    return (
        <div className="faq-page-container">
            {/* Simple Header */}
            <nav className="faq-nav">
                <Link to="/" className="faq-nav-brand">Donna</Link>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#666', textDecoration: 'none', fontSize: '0.9rem' }}>
                    <ArrowLeft size={16} /> Back to Home
                </Link>
            </nav>

            <header className="faq-hero">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h1>Frequently Asked Questions</h1>
                    <p>Everything you need to know about your AI companion.</p>
                </motion.div>
            </header>

            <main className="faq-content">
                {faqs.map((category, catIndex) => (
                    <div key={catIndex} className="faq-category">
                        <h3 className="faq-category-title">{category.category}</h3>
                        {category.items.map((item, itemIndex) => {
                            const uniqueIndex = `${catIndex}-${itemIndex}`;
                            return (
                                <div
                                    key={itemIndex}
                                    className={`faq-item ${activeIndex === uniqueIndex ? 'active' : ''}`}
                                    onClick={() => toggleAccordion(uniqueIndex)}
                                >
                                    <button className="faq-question">
                                        {item.q}
                                        <ChevronDown className="faq-icon" />
                                    </button>
                                    <div className="faq-answer">
                                        <p>{item.a}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}

                <div className="faq-contact">
                    <h3>Still have questions?</h3>
                    <p>We're here to help. Reach out to us anytime.</p>
                    <a href="mailto:support@donna.ai" className="contact-link">support@donna.ai</a>
                </div>
            </main>
        </div>
    );
};

export default FAQPage;
