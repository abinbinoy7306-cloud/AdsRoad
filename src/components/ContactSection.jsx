import React, { useState } from 'react';
import { ChevronDown, Info, X } from 'lucide-react';

const INFO_SECTIONS = [
    {
        id: 'about',
        title: 'About Us',
        content:(
            <><p>AdsRoad is a funny and affordable advertising platform where businesses, job recruters, job seekers, freelancers, service providers, and others can publish ads for the price of a coffee ($2) for 30 days. Users can also advertise for free by collecting 50 Golden Eggs for 30 days also.</p>
            </>
            )
},
    {
        id: 'terms',
        title: 'Terms and Conditions',
        content:
            (<>
            <p>Last Updated: May 23, 2026.</p><br />
            
            <p>Welcome to AdsRoad. By accessing or using the AdsRoad platform, website, or services, you agree to comply with and be bound by the following Terms and Conditions. Please read them carefully before using the platform.</p><br />
            
            <p><strong>1. Advertisement Rules</strong></p>

            <p>Users are fully responsible for the content they publish on AdsRoad.</p><br />

            <p><u>Prohibited Contents:</u></p>

            <p>
            <li>Illegal products or services</li>
            <li>Adult or sexually explicit content</li>
            <li>Hate speech or discriminatory content</li>
            <li>Violence or harmful material</li>
            <li>Fraudulent, misleading, or scam-related advertisements</li>
            <li>Copyright-infringing material</li>
            <li>Spam or malicious content</li>
            <li>Drugs, weapons, or other restricted products where prohibited by law</li>
            </p><br />

            <p>AdsRoad reserves the right to remove, reject, suspend, or ban any advertisement or account without prior notice if it violates these Terms.</p><br />

            <p><strong>2. User Responsibilities</strong></p>

            <p><u>You agree:</u></p>

            <p>
            <li>Not to misuse the platform</li>
            <li>Not to attempt unauthorized access to AdsRoad systems</li>
            <li>Not to upload viruses, malicious code, or harmful files</li>
            <li>Not to impersonate another person or company</li>
            <li>To comply with all applicable local, national, and international laws</li>
            </p><br />

            <p><strong>3. No Guarantee of Results</strong></p>

            <p><u>AdsRoad does not guarantee:</u></p>

            <p>
            <li>Sales</li>
            <li>Leads</li>
            <li>Job offers</li>
            <li>Customer engagement</li>
            <li>Advertisement performance or reach</li>
            </p><br />

            <p>All advertising outcomes may vary depending on content quality, audience behavior, and market conditions.</p><br />

            <p><strong>4. Limitation of Liability</strong></p>

            <p>AdsRoad is offered as available, and we do not guarantee that the platform will always function without errors, interruptions, or technical issues.</p><br />

            <p><u>AdsRoad shall not be liable for:</u></p>

            <p>
            <li>Loss of profits or revenue</li>
            <li>Business interruption</li>
            <li>Unauthorized access</li>
            <li>Any indirect or consequential damages resulting from the use of the platform</li>
            </p><br />

            <p><strong>5. Third-Party Links and Services</strong></p>

            <p>Advertisements or platform content may contain links to third-party websites or services. AdsRoad is not responsible for the content, security, or practices of third-party platforms.</p><br />

            <p><strong>6. Privacy</strong></p>

            <p>By using AdsRoad, you also agree to the platform's Privacy Policy.Uploaded contents and details are visible for other users.</p><br />

            <p><strong>7. Changes to Terms</strong></p>

            <p>AdsRoad may update or modify these Terms and Conditions at any time without prior notice. Continued use of the platform after changes are made constitutes acceptance of the updated Terms.</p><br />

            <p><strong>8. Governing Law</strong></p>

            <p>These Terms shall be governed and interpreted in accordance with the laws applicable in your operating jurisdiction.</p><br />
            </>
            )
    },
    {
        id: 'refund',
        title: 'Cancellation and Refund Policy',
        content:
            (
                <>
                <p>Last Updated: May 23, 2026.</p><br />

                <p>Thank you for using AdsRoad. This Cancellation and Refund Policy explains how advertisement edits, deletions, and payments are handled on the platform.</p><br />

                <p><strong>1. Advertisement Cancellation</strong></p>

                <p>Users may delete or edit their advertisements at any time through their AdsRoad account.</p><br />

                <p><u>However:</u></p>

                <p>
                <li>Deleting an advertisement does not cancel the original purchase</li>
                <li>The advertisement period will not be paused or extended</li>
                <li>No refund or credit will be provided for deleted advertisements</li>
                </p><br />

                <p><strong>2. Refund Policy</strong></p>

                <p>All payments made on AdsRoad are final and non-refundable.</p><br />

                <p><u>This includes:</u></p>

                <p>
                <li>Paid advertisements</li>
                <li>Promotional purchases</li>
                <li>Any platform-related fees</li>
                </p><br />

                <p><u>Refunds will not be provided under any circumstances, including:</u></p>

                <p>
                <li>User dissatisfaction</li>
                <li>Low ad performance or engagement</li>
                <li>Accidental purchases</li>
                <li>Early deletion of advertisements</li>
                <li>Policy violations resulting in ad removal</li>
                <li>Unused advertisement duration</li>
                </p><br />

                <p><strong>3. Failed or Duplicate Payments</strong></p>

                <p>If a payment is successfully charged multiple times due to a technical issue, users may contact AdsRoad support for verification and resolution.</p><br />

                <p><strong>4. Free Advertisements Using Golden Eggs</strong></p>

                <p>Advertisements published using 50 Golden Eggs are also non-refundable and non-transferable.</p><br />

                <p><u>Golden Eggs:</u></p>

                <p>
                <li>Cannot be exchanged for money</li>
                <li>Cannot be transferred between accounts</li>
                <li>May expire or change based on platform policies</li>
                </p><br />

                <p><strong>5. Platform Rights</strong></p>

                <p><u>AdsRoad reserves the right to:</u></p>

                <p>
                <li>Remove advertisements that violate platform rules</li>
                <li>Modify this policy at any time without prior notice</li>
                </p>

                </>
            )
    },
    {
        id: 'contact',
        title: 'Contact Us',
        content:
            (
                <>
                <p>For payment-related questions or technical issues, users can contact AdsRoad at:</p>
                <a href="mailto:adsroad12@gmail.com">adsroad12@gmail.com</a>
                <p>You will receive a response within 3-5 business days.</p>
                </>
            )
    },
];

export default function ContactSection() {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedSection, setExpandedSection] = useState('about');

    const toggleSidebar = () => setIsOpen((current) => !current);
    const closeSidebar = () => setIsOpen(false);

    const handleSectionToggle = (sectionId) => {
        setExpandedSection((current) => (current === sectionId ? null : sectionId));
    };

    return (
        <>
            {isOpen && (
                <button
                    type="button"
                    className="info-sidebar-backdrop"
                    onClick={closeSidebar}
                    aria-label="Close information sidebar"
                />
            )}

            <div className="contact-section">
                <button
                    type="button"
                    className={`contact-trigger info-trigger ${isOpen ? 'active' : ''}`}
                    onClick={toggleSidebar}
                    aria-label={isOpen ? 'Close information sidebar' : 'Open information sidebar'}
                    aria-expanded={isOpen}
                >
                    <Info size={20} />
                </button>
            </div>

            <aside className={`info-sidebar ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
                <div className="info-sidebar-header">
                    <div>
                        <p className="info-sidebar-kicker">Information</p>
                        <h3>Quick Links</h3>
                    </div>
                    <button
                        type="button"
                        className="info-sidebar-close"
                        onClick={closeSidebar}
                        aria-label="Close information sidebar"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="info-sidebar-list">
                    {INFO_SECTIONS.map((section) => {
                        const isExpanded = expandedSection === section.id;

                        return (
                            <div
                                key={section.id}
                                className={`info-accordion-item ${isExpanded ? 'expanded' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="info-accordion-trigger"
                                    onClick={() => handleSectionToggle(section.id)}
                                    aria-expanded={isExpanded}
                                >
                                    <span>{section.title}</span>
                                    <ChevronDown size={18} />
                                </button>

                                {isExpanded && (
                                    <div className="info-accordion-content">
                                        <div className="info-text space-y-4">{section.content}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </aside>
        </>
    );
}
