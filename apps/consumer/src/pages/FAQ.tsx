import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const faqData = [
  {
    category: 'Getting Started',
    items: [
      {
        question: 'How do I sign up for Donna?',
        answer: 'Simply click "Get Started" on our homepage and follow the onboarding process. You\'ll create an account, add information about your loved one, and set up a call schedule in just a few minutes.'
      },
      {
        question: 'How much does Donna cost?',
        answer: 'We offer flexible pricing plans starting with a free trial. Contact us for detailed pricing information based on your specific needs and call frequency.'
      },
      {
        question: 'Can I try Donna before committing?',
        answer: 'Yes! We offer a free trial period so you can experience how Donna works with your loved one before making any commitment.'
      },
    ],
  },
  {
    category: 'How Donna Works',
    items: [
      {
        question: 'What happens during a typical call?',
        answer: 'Donna engages in natural, friendly conversation tailored to your loved one\'s interests. She can discuss news, weather, share stories, and gently remind about medications or appointments when needed.'
      },
      {
        question: 'How does Donna remember my loved one\'s preferences?',
        answer: 'Donna uses advanced memory systems to remember details from past conversations, interests you\'ve shared, and important information. Each call builds on previous interactions.'
      },
      {
        question: 'Can I customize what Donna talks about?',
        answer: 'Absolutely! During onboarding, you\'ll specify your loved one\'s interests, and you can update these anytime through the dashboard. Donna adapts her conversation topics accordingly.'
      },
    ],
  },
  {
    category: 'Privacy & Safety',
    items: [
      {
        question: 'Is my loved one\'s information secure?',
        answer: 'Yes, we take privacy very seriously. All data is encrypted, and we comply with healthcare privacy standards. We never share personal information with third parties.'
      },
      {
        question: 'How do I know if something is wrong?',
        answer: 'After each call, you\'ll receive a summary. If Donna detects any concerns - health issues, mood changes, or safety concerns - you\'ll be notified immediately via your preferred method.'
      },
    ],
  },
];

export default function FAQ() {
  const [activeIndex, setActiveIndex] = useState<string | null>(null);

  const toggleItem = (key: string) => {
    setActiveIndex(activeIndex === key ? null : key);
  };

  return (
    <div className="min-h-screen bg-bg-cream">
      {/* Header */}
      <header className="py-6 px-6">
        <div className="max-w-4xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sage-green hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-xl text-gray-600">
            Find answers to common questions about Donna and how it works.
          </p>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="py-8 px-6 pb-20">
        <div className="max-w-3xl mx-auto space-y-8">
          {faqData.map((section) => (
            <div key={section.category}>
              <h2 className="text-xl font-bold text-sage-green mb-4">{section.category}</h2>
              <div className="space-y-3">
                {section.items.map((item, index) => {
                  const key = `${section.category}-${index}`;
                  const isOpen = activeIndex === key;

                  return (
                    <div key={key} className="glass-card overflow-hidden">
                      <button
                        onClick={() => toggleItem(key)}
                        className="w-full px-6 py-4 flex items-center justify-between text-left"
                      >
                        <span className="font-medium pr-4">{item.question}</span>
                        <motion.div
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className="px-6 pb-4 text-gray-600">
                              {item.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="py-8 px-6 border-t border-gray-200">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-gray-600">
            Still have questions?{' '}
            <a href="mailto:support@donna.ai" className="text-sage-green hover:underline">
              Contact us at support@donna.ai
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
