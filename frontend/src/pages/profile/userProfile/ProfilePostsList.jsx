// src/pages/profile/userProfile/ProfilePostsList.jsx
// Profile feed list that renders the EXACT Community PostCard, with profile-specific overrides:
// - Location line is *not* clickable — we block via CSS and capture-phase event handlers.
// - Category chip is re-homed under the Edit button (keeping the *original* chip styles + icons).
// - Lost posts: "Mark as Found" button appears to the right of the category chip.
// - Infinite render: show 20 initially; when you scroll past the 15th item of the current chunk, load 20 more.

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

// Use the Community page's card directly (with new optional overrides)
import { PostCard as CommunityPostCard } from '../../community/CommunityList';

// Popover and share dialog (unchanged behavior)
import UserCardPopover from '../../../components/UserCardPopover';
import SharePostDialog from '../../../components/SharePostDialog';

/**
 * Find the "category" chip that CommunityPostCard renders (top-right in its header),
 * hide it, then clone+append it to our host container.
 *
 * We do this so we preserve the exact same style + icon mapping that CommunityPostCard already uses.
 */
function moveCategoryChipToHost(rootEl, hostEl) {
    if (!rootEl || !hostEl) return;

    // Clear host before re-homing
    hostEl.innerHTML = '';

    // Restore any previously hidden chip(s) in this card
    const prevHidden = rootEl.querySelectorAll('[data-ll-hidden-category-chip="1"]');
    prevHidden.forEach((chip) => {
        chip.style.display = chip.dataset.llPrevDisplay || '';
        chip.removeAttribute('data-ll-hidden-category-chip');
        delete chip.dataset.llPrevDisplay;
    });

    // Collect MUI chip roots inside the card
    const chips = Array.from(rootEl.querySelectorAll('.MuiChip-root, [class*="MuiChip-root"]'));
    if (!chips.length) return;

    const rootBox = rootEl.getBoundingClientRect();

    // Pick the chip closest to the card's top-right corner (header chip),
    // and prefer chips that include an SVG icon (category chips typically do).
    let best = null;
    let bestScore = -Infinity;

    const scoreChip = (chip) => {
        if (!chip || hostEl.contains(chip)) return -Infinity;

        // ignore our clone
        if (chip.getAttribute('data-ll-cloned-category-chip') === '1') return -Infinity;

        const r = chip.getBoundingClientRect();
        const relTop = r.top - rootBox.top;
        const relRight = rootBox.right - r.right;

        // Strongly prefer header zone; most category chips live here.
        // We still allow a fallback pass if none found.
        const headerPenalty = relTop <= 130 ? 0 : -250;

        const hasIcon = !!chip.querySelector('svg');

        // Higher is better: closer to top-right + icon bonus
        return (-(relTop * 2) - relRight) + (hasIcon ? 8 : 0) + headerPenalty;
    };

    for (const chip of chips) {
        const s = scoreChip(chip);
        if (s > bestScore) {
            bestScore = s;
            best = chip;
        }
    }

    // Nothing reasonable found
    if (!best || bestScore === -Infinity) return;

    // Hide original
    best.dataset.llPrevDisplay = best.style.display || '';
    best.setAttribute('data-ll-hidden-category-chip', '1');
    best.style.display = 'none';

    // Clone and mount into host
    const clone = best.cloneNode(true);
    clone.style.display = best.dataset.llPrevDisplay || '';
    clone.setAttribute('data-ll-cloned-category-chip', '1');
    // Category chip shouldn't navigate / interfere with card click
    clone.style.pointerEvents = 'none';
    clone.style.cursor = 'default';
    clone.style.userSelect = 'none';

    hostEl.appendChild(clone);
}

// Re-export for the expanded overlay in UserProfilePage.jsx
// Hard-disable location link for all cards rendered via this list.
export const ProfilePostCard = memo(function ProfilePostCard(props) {
    const { post, user, ...rest } = props;

    const rootRef = useRef(null);
    const categoryHostRef = useRef(null);

    const fire = useCallback((type, detail) => {
        try {
            window.dispatchEvent(new CustomEvent(type, { detail }));
        } catch {
            // ignore
        }
    }, []);

    const normHandle = useCallback(
        (h) => String(h || '').replace(/^@/, '').trim().toLowerCase(),
        []
    );

    const isOwner = useMemo(() => {
        const viewerId = Number(user?.id || 0);
        const postUserId = Number(post?.user_id || 0);
        if (viewerId && postUserId && viewerId === postUserId) return true;
        const vh = normHandle(user?.handle);
        const ph = normHandle(post?.handle);
        return !!(vh && ph && vh === ph);
    }, [normHandle, post?.handle, post?.user_id, user?.handle, user?.id]);

    const isEdited = useMemo(() => {
        const ea = post?.edited_at || post?.editedAt || post?.updated_at || null;
        if (!ea) return false;
        const posted = new Date(post?.posted_at || post?.date_created || post?.created_at || 0).getTime();
        const edited = new Date(ea).getTime();
        return edited && posted && edited > posted + 60 * 1000; // >1min after post time
    }, [post?.edited_at, post?.editedAt, post?.updated_at, post?.posted_at, post?.date_created, post?.created_at]);

    // Lost & Found helpers (UI only)
    const lostOrFound = String(post?.lost_or_found || '').toLowerCase(); // 'lost' | 'found' | ''
    const resolvedAt = post?.resolved_at || post?.resolvedAt || null;
    const resolvedMessage = post?.resolved_message || post?.resolvedMessage || '';
    const showMarkFound =
        isOwner &&
        (lostOrFound === 'lost' || (!lostOrFound && post?.category === 'lost-and-found')) &&
        !resolvedAt;

    // If resolved, show the update message above the old description.
    const displayPost = useMemo(() => {
        if (!resolvedAt) return post;

        const baseDesc = String(post?.description || '');
        const updateLine = resolvedMessage
            ? `Update: ${resolvedMessage}`
            : 'Update: Marked as Found by the Owner.';
        const combined = baseDesc ? `${updateLine}\n\n— Original Post —\n${baseDesc}` : updateLine;

        return { ...post, description: combined };
    }, [post, resolvedAt, resolvedMessage]);

    // Capture-phase handler: swallow any likely location link navigation.
    const swallowLocationClicks = useCallback((e) => {
        const a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a') : null;
        if (!a) return;

        const href = (a.getAttribute('href') || '').toLowerCase();
        const aria = (a.getAttribute('aria-label') || '').toLowerCase();
        const role = (a.getAttribute('data-role') || '').toLowerCase();
        const dataLoc = (a.getAttribute('data-location') || a.getAttribute('data-loc') || '').toLowerCase();

        const looksLikeLocation =
            role === 'location' ||
            dataLoc === 'true' ||
            aria.includes('location') ||
            /(county|counties|city|cities|place|places|location|locations|neighborhood|map|maps|google\.com\/maps)/.test(
                href
            );

        if (looksLikeLocation) {
            e.preventDefault();
            e.stopPropagation();
            a.blur?.();
        }
    }, []);

    /**
     * Move the *original* category chip (with its real icon/colors)
     * into our dedicated host, under the Edit button.
     *
     * useLayoutEffect avoids the user seeing a "flash" of the chip in the old location.
     */
    useLayoutEffect(() => {
        const root = rootRef.current;
        const host = categoryHostRef.current;
        moveCategoryChipToHost(root, host);

        // Cleanup: restore the hidden chip if the card unmounts
        return () => {
            if (!root) return;
            const hidden = root.querySelectorAll('[data-ll-hidden-category-chip="1"]');
            hidden.forEach((chip) => {
                chip.style.display = chip.dataset.llPrevDisplay || '';
                chip.removeAttribute('data-ll-hidden-category-chip');
                delete chip.dataset.llPrevDisplay;
            });
        };
        // Re-run when the post changes, because category/icon may differ per post.
    }, [post?.id, post?.category, post?.lost_or_found, post?.rec_type, rootRef.current]);

    // Also re-run after first paint if the card loads async content (very cheap).
    useEffect(() => {
        const t = setTimeout(() => {
            moveCategoryChipToHost(rootRef.current, categoryHostRef.current);
        }, 0);
        return () => clearTimeout(t);
    }, [post?.id, post?.category, post?.lost_or_found, post?.rec_type]);

    // Layout: Edit is top-right. Category row is just under Edit when owner,
    // or in the top-right when not owner (so it doesn't leave a "gap").
    const topEdit = 10;
    const topCategory = isOwner ? 46 : 10;
    const topResolved = isOwner ? 78 : 42;

    return (
        <Box
            ref={rootRef}
            onClickCapture={swallowLocationClicks}
            onMouseDownCapture={swallowLocationClicks}
            onKeyDownCapture={(e) => {
                if (e.key === 'Enter' || e.key === ' ') swallowLocationClicks(e);
            }}
            sx={{
                position: 'relative',
                // Visually remove click affordance on any plausible location link inside the card
                '& a[data-location], & a[data-role="location"], & .post-location a, & [data-post-location] a, & a[href*="/county"], & a[href*="/counties"], & a[href*="/city"], & a[href*="/cities"], & a[href*="/place"], & a[href*="/places"], & a[href*="/location"], & a[href*="/locations"], & a[href*="/map"], & a[href*="google.com/maps"]': {
                    pointerEvents: 'none',
                    cursor: 'default',
                    textDecoration: 'none',
                    color: 'inherit',
                },
            }}
        >
            {/* TOP-RIGHT: Edit Post (owner only) */}
            {isOwner && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: topEdit,
                        right: 12,
                        zIndex: 7,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <Tooltip title="Edit post">
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<EditIcon fontSize="small" />}
                            onClick={() => {
                                fire('ll:communityPost:requestEdit', { postId: post?.id, post });
                            }}
                            sx={{
                                textTransform: 'none',
                                lineHeight: 1.1,
                                px: 1,
                                py: 0.4,
                                minWidth: 0,
                                borderRadius: 999,
                                bgcolor: 'rgba(255,255,255,0.92)',
                                borderColor: 'divider',
                                boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                                '&:hover': {
                                    bgcolor: 'rgba(255,255,255,1)',
                                },
                            }}
                        >
                            Edit Post
                        </Button>
                    </Tooltip>
                </Box>
            )}

            {/* CATEGORY ROW (re-homed original chip) + Mark as Found (lost posts) */}
            <Box
                sx={{
                    position: 'absolute',
                    top: topCategory,
                    right: 12,
                    zIndex: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    // allow long category chips (e.g., Help Requests) to extend left
                    maxWidth: 'calc(100% - 24px)',
                }}
                onClick={(e) => {
                    // do not trigger card navigation
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <Box
                    ref={categoryHostRef}
                    data-ll-category-host="1"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        // Keep the chip tight and prevent it from shrinking oddly
                        flex: '0 1 auto',
                    }}
                />
                {showMarkFound && (
                    <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                            fire('ll:communityPost:requestMarkFound', { postId: post?.id, post });
                        }}
                        sx={{
                            textTransform: 'none',
                            lineHeight: 1.1,
                            px: 1,
                            py: 0.4,
                            minWidth: 0,
                            borderRadius: 999,
                            flex: '0 0 auto',
                        }}
                    >
                        Mark as Found
                    </Button>
                )}
            </Box>

            {/* “Marked as Found” badge — under the category row */}
            {!!resolvedAt && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: topResolved,
                        right: 12,
                        zIndex: 5,
                        bgcolor: 'rgba(255,193,7,0.18)',
                        border: '1px solid',
                        borderColor: 'rgba(255,193,7,0.55)',
                        borderRadius: 999,
                        px: 1,
                        py: 0.25,
                        pointerEvents: 'none',
                    }}
                >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        Marked as Found by the Owner
                    </Typography>
                </Box>
            )}

            <CommunityPostCard
                {...rest}
                post={displayPost || post}
                // Force the underlying card to render as non-interactive (belt & suspenders)
                locationClickable={false}
                onLocationClick={undefined}
            />

            {/* Edited tag (click to open history) */}
            {isEdited && (
                <Box
                    sx={{
                        position: 'absolute',
                        right: 12,
                        bottom: 10,
                        zIndex: 4,
                    }}
                >
                    <Typography
                        variant="caption"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            fire('ll:communityPost:requestHistory', { postId: post?.id, post });
                        }}
                        sx={{
                            cursor: 'pointer',
                            fontWeight: 700,
                            px: 0.75,
                            py: 0.2,
                            borderRadius: 1,
                            userSelect: 'none',
                            bgcolor: 'rgba(255,255,255,0.75)',
                            border: '1px solid',
                            borderColor: 'divider',
                            '&:hover': {
                                bgcolor: 'rgba(255,235,59,0.60)', // yellow highlight
                            },
                        }}
                        title="Click to view edit history"
                    >
                        Edited
                    </Typography>
                </Box>
            )}
        </Box>
    );
});
ProfilePostCard.displayName = 'ProfilePostCard';

// Chunking strategy for controlled lists
const CHUNK_SIZE = 20;
const LOAD_MORE_AT = 15; // when the 15th item of the *current* chunk is reached, render the next 20

export default function ProfilePostsList({
                                             user,
                                             posts = [],
                                             loading = false,
                                             hoveredId,
                                             setHoveredId,
                                             onCardClick,
                                         }) {
    const list = useMemo(() => (Array.isArray(posts) ? posts : []), [posts]);

    // Render window (virtualized in chunks; no API change)
    const [renderCount, setRenderCount] = useState(CHUNK_SIZE);
    useEffect(() => {
        // Reset window when incoming posts change
        setRenderCount(CHUNK_SIZE);
    }, [list.length]);

    const visibleCount = Math.min(renderCount, list.length);
    const sentinelAfterIndex = Math.max(0, visibleCount - (CHUNK_SIZE - LOAD_MORE_AT)); // e.g., 20 - 5 = 15
    const loadMoreRef = useRef(null);

    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el) return;

        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                // grow by CHUNK_SIZE each time, up to the total list length
                setRenderCount((c) => Math.min(c + CHUNK_SIZE, list.length));
            },
            { root: null, rootMargin: '600px' } // prefetch a bit early
        );

        io.observe(el);
        return () => io.disconnect();
    }, [list.length, visibleCount]);

    // Popover + Share
    const [userAnchor, setUserAnchor] = useState(null);
    const [userForCard, setUserForCard] = useState(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [sharePost, setSharePost] = useState(null);

    const handleOpenUserCard = useCallback((el, authorLike) => {
        const id =
            Number(authorLike?.id) ||
            Number(authorLike?.user_id) ||
            (authorLike?.post?.user_id ? Number(authorLike.post.user_id) : undefined);

        setUserAnchor(el);
        setUserForCard({
            id: id || undefined,
            first_name: authorLike?.first_name,
            last_name: authorLike?.last_name,
            handle: authorLike?.handle,
            avatar_url: authorLike?.avatar_url || authorLike?.profile_picture,
        });
    }, []);

    const isSelf =
        !!user &&
        !!userForCard &&
        (Number(user.id) === Number(userForCard.id) ||
            (!!user.handle &&
                !!userForCard.handle &&
                String(user.handle).toLowerCase() === String(userForCard.handle).toLowerCase()));

    return (
        <Box sx={{ position: 'relative', minHeight: 240, width: '100%', overflow: 'hidden' }}>
            {loading && visibleCount === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
                    Loading…
                </Typography>
            ) : null}

            {/* One card per row to keep the profile rail width */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                {list.slice(0, visibleCount).map((p, i) => (
                    <React.Fragment key={`${p.category || 'post'}-${p.id}`}>
                        <ProfilePostCard
                            post={p}
                            user={user}
                            hoveredId={hoveredId}
                            setHoveredId={setHoveredId}
                            // Profile-specific overrides:
                            previewWords={28}
                            previewLineClamp={4}
                            onCardClick={onCardClick}
                            onOpenUserCard={handleOpenUserCard}
                            onOpenShare={(post0) => {
                                setSharePost(post0);
                                setShareOpen(true);
                            }}
                        />
                        {/* Sentinel: appears right after the 15th item of the current chunk */}
                        {i === sentinelAfterIndex - 1 && <Box ref={loadMoreRef} sx={{ height: 1 }} />}
                    </React.Fragment>
                ))}
            </Box>

            {!loading && list.length === 0 ? (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="body2" color="text.secondary">
                        No posts found.
                    </Typography>
                </Box>
            ) : null}

            {/* Popover + Share — same UX as Community */}
            <UserCardPopover
                anchorEl={userAnchor}
                onClose={() => setUserAnchor(null)}
                user={userForCard}
                isSelf={isSelf}
                following={false}
                onFollow={() => {}}
                onMessage={() =>
                    window.dispatchEvent(
                        new CustomEvent('open-message-center', {
                            detail: { userId: userForCard?.id },
                        })
                    )
                }
                onViewProfile={(u) => window.location.assign(`/${u.handle || u.id}`)}
            />

            <SharePostDialog open={shareOpen} onClose={() => setShareOpen(false)} viewer={user} post={sharePost} />
        </Box>
    );
}

ProfilePostsList.propTypes = {
    user: PropTypes.object,
    posts: PropTypes.array,
    loading: PropTypes.bool,
    hoveredId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    setHoveredId: PropTypes.func,
    onCardClick: PropTypes.func,
};
