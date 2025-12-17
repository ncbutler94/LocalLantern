// Renders Step-1 (CategoryPopup) and Step-2 (category-specific form),
// with required modal behavior: top-right X and no outside-click close.
// Also wires *all* Step-2 forms with onSubmit handlers so we never
// trigger “onSubmit is not a function”, and fetches the user's
// saved (database) location to pass as defaults (county required).

import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

import CategoryPopup from './CategoryPopup.jsx';
import NewLostAndFoundForm from './NewLostAndFoundForm.jsx';
import NewAnnouncementForm from './NewAnnouncementForm.jsx';
import NewGeneralDiscussionForm from './NewGeneralDiscussionForm.jsx';
import NewPublicSafetyForm from './NewPublicSafetyForm.jsx';
import NewRecommendationForm from './NewRecommendationForm.jsx';
import NewVolunteerHelpForm from './NewVolunteerHelpForm.jsx';

export default function NewPostDialogs({
                                           stepOneOpen,
                                           stepTwoOpen,
                                           stepOneData,          // { category: '<slug>' }
                                           onClose1,
                                           onClose2,
                                           onCategoryChosen,     // (data) => void
                                           onRefresh,            // () => refetch posts after successful submit
                                           subtypes,             // categories to show in CategoryPopup
                                       }) {
    /* ──────────────────────────────────────────────────────────────
     * 1) Pull the user’s saved (database) location once when the
     *    Step-2 dialog opens. We pass these defaults down so the
     *    forms can prefill (county required, city optional).
     * ────────────────────────────────────────────────────────────── */
    const [defaults, setDefaults] = useState({ city: '', county: '' });
    const [attemptedFetch, setAttemptedFetch] = useState(false);

    useEffect(() => {
        if (!stepTwoOpen || attemptedFetch) return;
        setAttemptedFetch(true);

        const fetchDefaults = async () => {
            try {
                const r = await fetch('/users/profile', {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                });
                if (!r.ok) return;

                const obj = await r.json();

                const candidates = [
                    obj,
                    obj.user,
                    obj.me,
                    obj.profile,
                    obj.account,
                    obj.data,
                ].filter(Boolean);

                for (const root of candidates) {
                    const county =
                        (root.county ??
                            root.home_county ??
                            root.default_county ??
                            (root.location && root.location.county) ??
                            (root.address && root.address.county) ??
                            '');

                    const city =
                        (root.city ??
                            root.home_city ??
                            root.default_city ??
                            (root.location && root.location.city) ??
                            (root.address && root.address.city) ??
                            '');

                    if (county || city) {
                        setDefaults({
                            city: String(city || ''),
                            county: String(county || ''),
                        });
                        break;
                    }
                }
            } catch (e) {
                // silent (defaults remain empty)
            }
        };

        fetchDefaults();
    }, [stepTwoOpen, attemptedFetch]);

    useEffect(() => {
        if (!stepTwoOpen) {
            setAttemptedFetch(false);
            setDefaults({ city: '', county: '' });
        }
    }, [stepTwoOpen]);

    /* ──────────────────────────────────────────────────────────────
     * 2) Shared helper: POST as FormData
     * ────────────────────────────────────────────────────────────── */
    const post = async (url, formData, failMsg) => {
        const res = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        if (!res.ok) {
            const msg = (await res.text()) || failMsg;
            throw new Error(msg);
        }
        return res.json();
    };

    const postLostAndFound      = (fd) => post('/api/lost-and-found',     fd, 'Failed to submit lost & found.');
    const postAnnouncement      = (fd) => post('/api/announcements',      fd, 'Failed to submit announcement.');
    const postGeneralDiscussion = (fd) => post('/api/general-discussion', fd, 'Failed to submit general discussion post.');
    const postPublicSafety      = (fd) => post('/api/public-safety',      fd, 'Failed to submit public safety alert.');
    const postRecommendation    = (fd) => post('/api/recommendations',    fd, 'Failed to submit recommendation/tip.');
    // Volunteer/Help request submits inside its dialog via createVolunteerRequest()

    /* ──────────────────────────────────────────────────────────────
     * 3) Render Step-2 form that matches the picked slug.
     * ────────────────────────────────────────────────────────────── */
    const renderStepTwoForm = () => {
        const slug = stepOneData?.category || '';

        const commonDefaults = {
            defaultCity: defaults.city,
            defaultCounty: defaults.county,
            countyRequired: true,
        };

        switch (slug) {
            case 'lost-and-found':
                return (
                    <NewLostAndFoundForm
                        onClose={onClose2}
                        onSubmit={postLostAndFound}
                        onRefresh={onRefresh}
                        {...commonDefaults}
                    />
                );

            case 'announcements':
            case 'announcement':
                return (
                    <NewAnnouncementForm
                        onClose={onClose2}
                        onSubmit={postAnnouncement}
                        onRefresh={onRefresh}
                        {...commonDefaults}
                    />
                );

            case 'general-discussion':
                return (
                    <NewGeneralDiscussionForm
                        onClose={onClose2}
                        onSubmit={postGeneralDiscussion}
                        onRefresh={onRefresh}
                        {...commonDefaults}
                    />
                );

            case 'public-safety-alerts':
                return (
                    <NewPublicSafetyForm
                        onClose={onClose2}
                        onSubmit={postPublicSafety}
                        onRefresh={onRefresh}
                        {...commonDefaults}
                    />
                );

            case 'recommendations-tips':
                return (
                    <NewRecommendationForm
                        onClose={onClose2}
                        onSubmit={postRecommendation}
                        onRefresh={onRefresh}
                        {...commonDefaults}
                    />
                );

            case 'help-requests':
            case 'volunteer-help-requests':
            case 'volunteer-help':
                return (
                    <NewVolunteerHelpForm
                        onClose={onClose2}
                        onRefresh={onRefresh}
                        defaultRequestKind="help"
                        {...commonDefaults}
                    />
                );

            case 'volunteer-requests':
            case 'volunteers':
                return (
                    <NewVolunteerHelpForm
                        onClose={onClose2}
                        onRefresh={onRefresh}
                        defaultRequestKind="volunteer"
                        {...commonDefaults}
                    />
                );

            default:
                return null;
        }
    };

    /* ──────────────────────────────────────────────────────────────
     * 4) Step-1 and Step-2 dialogs with “X” buttons and no backdrop/ESC close
     * ────────────────────────────────────────────────────────────── */
    return (
        <>
            {/* Step 1 */}
            <Dialog
                open={stepOneOpen}
                onClose={(_, reason) => {
                    if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') onClose1();
                }}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { position: 'relative' } }}
            >
                <IconButton
                    onClick={onClose1}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'rgba(0,0,0,0.05)',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                        zIndex: 1,
                    }}
                    aria-label="Close"
                >
                    <CloseIcon />
                </IconButton>

                <CategoryPopup
                    subtypes={subtypes}
                    onCancel={onClose1}
                    onCategoryChosen={(d) => onCategoryChosen(d)}
                />
            </Dialog>

            {/* Step 2 */}
            <Dialog
                open={stepTwoOpen}
                onClose={(_, reason) => {
                    if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') onClose2();
                }}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { position: 'relative' } }}
            >
                <IconButton
                    onClick={onClose2}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'rgba(0,0,0,0.05)',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                        zIndex: 1,
                    }}
                    aria-label="Close"
                >
                    <CloseIcon />
                </IconButton>

                {renderStepTwoForm()}
            </Dialog>
        </>
    );
}
