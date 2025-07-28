// src/components/SidePanel/Community/NewCommunityPosts/NewPostDialogs.jsx
import React from 'react';
import Dialog from '@mui/material/Dialog';

import CategoryPopup          from './CategoryPopup.jsx';
import NewLostAndFoundForm    from './NewLostAndFoundForm.jsx';
import NewAnnouncementForm    from './NewAnnouncementForm.jsx';
import NewGeneralDiscussionForm from './NewGeneralDiscussionForm.jsx';
import NewPublicSafetyForm  from './NewPublicSafetyForm.jsx';
import NewVolunteerHelpForm     from './NewVolunteerHelpForm';

import { createLostAndFound }      from '../../../../api/community/lostAndFound.js';
import { createAnnouncement }      from '../../../../api/community/announcement.js';
import { createGeneralDiscussion } from '../../../../api/community/generalDiscussion.js';
import { createPublicSafetyAlert } from '../../../../api/community/publicSafety.js';
import NewRecommendationForm   from './NewRecommendationForm.jsx';
import { createRecommendation } from '../../../../api/community/recommendations.js';

export default function NewPostDialogs({
                                           stepOneOpen,
                                           stepTwoOpen,
                                           stepOneData,       // { category } selected in step 1
                                           onClose1,
                                           onClose2,
                                           onCategoryChosen,
                                           onSubmit           // callback to refetch list after posting
                                       }) {
    /* ── Step-2 renderer chooses the right form based on the slug ── */
    const renderStepTwoForm = () => {
        if (!stepOneData) return null;

        switch (stepOneData.category) {
            case 'lost-and-found':
                return (
                    <NewLostAndFoundForm
                        onClose={onClose2}
                        onSubmit={createLostAndFound}
                        onRefresh={onSubmit}
                    />
                );

            case 'general-discussion':
                return (
                    <NewGeneralDiscussionForm
                        onClose={onClose2}
                        onSubmit={createGeneralDiscussion}
                        onRefresh={onSubmit}
                    />
                );

            case 'announcements':     // slug from dropdown
            case 'announcement':      // fallback if slug ever tweaks
                return (
                    <NewAnnouncementForm
                        onClose={onClose2}
                        onSubmit={createAnnouncement}
                        onRefresh={onSubmit}
                    />
                );

            case 'public-safety-alerts':
                return (
                    <NewPublicSafetyForm
                        onClose={onClose2}
                        onSubmit={createPublicSafetyAlert}
                        onRefresh={onSubmit}
                    />
                );

                            case 'recommendations-tips':
                            return (
                                   <NewRecommendationForm
                    onClose={onClose2}
                                    onSubmit={createRecommendation}
                                    onRefresh={onSubmit}
                                   />
                                );

            case 'volunteer-requests':        // ← handles Volunteer & Help Requests
                return <NewVolunteerHelpForm    onClose={onClose2}
                                                onSubmit={createRecommendation}
                                                onRefresh={onSubmit} />;

            /* ⤵️ future categories go here
            case 'public-safety-alerts':
            … */

            default:
                return null;
        }
    };

    return (
        <>
            {/* ─── Step 1 – pick a category ─── */}
            <Dialog
                open={stepOneOpen}
                onClose={onClose1}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { width: 290 } }}
            >
                <CategoryPopup
                    onCancel={onClose1}
                    onCategoryChosen={(data) => {
                        onCategoryChosen(data);  // lifts { category } state up
                        onClose1();              // close step-1, show step-2
                    }}
                />
            </Dialog>

            {/* ─── Step 2 – category-specific form ─── */}
            <Dialog
                open={stepTwoOpen}
                onClose={onClose2}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { width: 580 } }}
            >
                {renderStepTwoForm()}
            </Dialog>
        </>
    );
}
