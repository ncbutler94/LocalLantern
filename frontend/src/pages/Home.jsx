import React from 'react';
import AllPage from './AllPage';
import CommunityPage from './CommunityPage';
import BusinessPage from './BusinessPage';
import EventsPage from './EventsPage';
import JobsPage from './JobsPage';
import ServicesPage from './ServicesPage';
import MarketplacePage from './MarketplacePage';
import DealsPage from './DealsPage';
import RealEstatePage from './RealEstatePage';

// Home serves as the central router for tab views
export default function Home({ activeTab, ...rest }) {
    switch (activeTab) {
        case 'All':
            return <AllPage {...rest} />;
        case 'Community':
            return <CommunityPage {...rest} />;
        case 'Business':
            return <BusinessPage {...rest} />;
        case 'Events':
            return <EventsPage {...rest} />;
        case 'Jobs':
            return <JobsPage {...rest} />;
        case 'Services':
            return <ServicesPage {...rest} />;
        case 'Marketplace':
            return <MarketplacePage {...rest} />;
        case 'Deals':
            return <DealsPage {...rest} />;
        case 'Real Estate':
            return <RealEstatePage {...rest} />;
        default:
            return <AllPage {...rest} />;
    }
}
