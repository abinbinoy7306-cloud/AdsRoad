export const DEFAULT_CATEGORY_ID = 'brand-advertisement';

export const AD_CATEGORIES = [
    {
        id: 'brand-advertisement',
        label: 'Brand Advertisement',
        description: 'Promote your business, products, offers, events, or brand campaigns to reach potential customers and grow your visibility.',
        primaryUrlLabel: 'Open Link',
        emptyState: 'No brand advertisements are live right now.',
    },
    {
        id: 'job-hiring',
        label: 'Job Recruiter',
        description: 'Post job openings and hiring announcements to connect with qualified candidates for full-time, part-time, remote, or contract positions.',
        primaryUrlLabel: 'Apply Now',
        emptyState: 'No job recruiter posts are live right now.',
    },
    {
        id: 'job-seeking',
        label: 'Job Seeker',
        description: 'Showcase your skills, experience, and career goals to attract employers and discover new job opportunities.',
        primaryUrlLabel: 'View Portfolio',
        emptyState: 'No job seeker profiles are live right now.',
    },
    {
        id: 'freelance',
        label: 'Freelance',
        description: 'Advertise your freelance services, portfolio, and expertise to find clients and grow your professional network.',
        primaryUrlLabel: 'View Portfolio',
        emptyState: 'No freelance profiles are live right now.',
    },
    {
        id: 'services',
        label: 'Services',
        description: 'Promote local or online services such as repair work, consulting, tutoring, beauty services, home services, and more.',
        primaryUrlLabel: 'Open Link',
        emptyState: 'No services listings are live right now.',
    },
    {
        id: 'others',
        label: 'Others',
        description: "Share advertisements that don't fit into the above categories, including events, community announcements, personal projects, promotions, and other opportunities.",
        primaryUrlLabel: 'Open Link',
        emptyState: 'No other listings are live right now.',
    },
];

export const CATEGORY_BY_ID = AD_CATEGORIES.reduce((accumulator, category) => {
    accumulator[category.id] = category;
    return accumulator;
}, {});

export function getCategoryById(categoryId) {
    return CATEGORY_BY_ID[categoryId] ?? CATEGORY_BY_ID[DEFAULT_CATEGORY_ID];
}
