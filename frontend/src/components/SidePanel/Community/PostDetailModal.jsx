// src/components/SidePanel/Community/PostDetailModal.jsx
// ============================================================================
import React, { useState, useEffect, useRef, Fragment } from 'react';
import PropTypes from 'prop-types';
import {
    Dialog, DialogContent,
    Box, Paper, Typography, Avatar,
    Button, IconButton, TextField, CircularProgress,
} from '@mui/material';
import SendIcon        from '@mui/icons-material/Send';
import FavoriteIcon    from '@mui/icons-material/Favorite';
import CommentIcon     from '@mui/icons-material/ChatBubbleOutline';
import ShareIcon       from '@mui/icons-material/Share';
import CloseIcon       from '@mui/icons-material/Close';
import ArrowBackIosNew from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIos from '@mui/icons-material/ArrowForwardIos';

import CampaignIcon   from '@mui/icons-material/Campaign';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import ReportIcon     from '@mui/icons-material/Report';
import LightbulbIcon  from '@mui/icons-material/Lightbulb';
import PanToolIcon    from '@mui/icons-material/PanTool';
import SearchIcon     from '@mui/icons-material/Search';

import { useAuthModal } from '../../../contexts/AuthModalContext';

/* ─────────── helpers ─────────── */
const timeAgo = (d = '') => {
    const diff = Date.now() - new Date(d).getTime();
    const s = Math.floor(diff / 1000); if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);      if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);      if (h < 24) return `${h}h ago`;
    const d2 = Math.floor(h / 24);     if (d2 < 30) return `${d2}d ago`;
    const mo = Math.floor(d2 / 30);    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
};

/* ─────────── badge palette ─────────── */
const BADGE = {
    announcement:              { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    announcements:             { label: 'Announcement', color: '#1e88e5', Icon: CampaignIcon },
    discussion:                { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },
    'general-discussion':      { label: 'Discussion',   color: '#2e7d32', Icon: ChatBubbleIcon },
    recommendation:            { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    'recommendations-tips':    { label: 'Tip',          color: '#fdd835', Icon: LightbulbIcon },
    volunteer:                 { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help':          { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-requests':      { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'volunteer-help-requests': { label: 'Volunteer',    color: '#0097a7', Icon: PanToolIcon },
    'lost-found':              { label: 'Lost / Found', color: '#fb8c00', Icon: SearchIcon },
    'public-safety-alerts':    { label: 'Alert',        color: '#e53935', Icon: ReportIcon },
};

const Pill = ({ label, Icon, color }) => (
    <Box sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5,
        px: 1, py: 0.25, bgcolor: color, color: '#fff',
        borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
        width: 'max-content',
    }}>
        <Icon sx={{ fontSize: 14 }} /> {label}
    </Box>
);

/* ─────────── loader overlay ─────────── */
const LoaderOverlay = ({ onClose }) => (
    <Box sx={{
        position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 2,
    }}>
        <Box sx={{
            display: 'flex', gap: 1,
            '@keyframes b': { '0%,80%,100%':{transform:'scale(0)'}, '40%':{transform:'scale(1.0)'} },
        }}>
            {[0,1,2].map(i=>(
                <Box key={i} sx={{
                    width:14,height:14,borderRadius:'50%',bgcolor:'primary.main',
                    animation:'b 1.4s infinite ease-in-out',animationDelay:`${i*0.2}s`,
                }}/>
            ))}
        </Box>
        <IconButton sx={{ position:'absolute', top:8, right:8 }} onClick={onClose}><CloseIcon/></IconButton>
    </Box>
);

/* ─────────── gallery ─────────── */
function Gallery({ pics, idx, setIdx, height, onImgLoad, onOpenLightbox }) {
    if (!pics.length) return null;
    return (
        <Fragment>
            <Box
                sx={{ position:'relative', width:'100%', height, overflow:'hidden',
                    '&:hover .nav':{opacity:1}, cursor:'pointer' }}
                onClick={onOpenLightbox}
            >
                <Box component="img" src={pics[idx]} alt=""
                     onLoad={onImgLoad}
                     sx={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:2 }}/>
                {pics.length>1 && (
                    <Fragment>
                        <IconButton className="nav" size="small" disabled={idx===0}
                                    onClick={e=>{e.stopPropagation();setIdx(i=>i-1);}}
                                    sx={{ position:'absolute', top:'50%', left:4, transform:'translateY(-50%)',
                                        bgcolor:'#fff', opacity:0, transition:'opacity .2s' }}>
                            <ArrowBackIosNew fontSize="small"/>
                        </IconButton>
                        <IconButton className="nav" size="small" disabled={idx===pics.length-1}
                                    onClick={e=>{e.stopPropagation();setIdx(i=>i+1);}}
                                    sx={{ position:'absolute', top:'50%', right:4, transform:'translateY(-50%)',
                                        bgcolor:'#fff', opacity:0, transition:'opacity .2s' }}>
                            <ArrowForwardIos fontSize="small"/>
                        </IconButton>
                    </Fragment>
                )}
            </Box>
            {pics.length>1 && (
                <Box sx={{ display:'flex', gap:1, mt:1, overflowX:'auto', pb:0.5 }}>
                    {pics.map((src,i)=>(
                        <Box key={src} component="img" src={src} alt=""
                             onClick={e=>{e.stopPropagation();setIdx(i);}}
                             sx={{
                                 width:60,height:60,objectFit:'cover',borderRadius:1,cursor:'pointer',
                                 border:i===idx?2:1, borderColor:i===idx?'primary.main':'divider',flexShrink:0,
                             }}/>
                    ))}
                </Box>
            )}
        </Fragment>
    );
}

/* ─────────── main component ─────────── */
export default function PostDetailModal({ open, post, onClose, currentUser }) {
    const { open: openAuth } = useAuthModal();
    const MAX_LEN = 1000;

    const {
        id: postId,
        first_name='', last_name='', avatar_url='',
        date_created='', title='', description='', category='',
        lost_or_found='', photos=[],
        likesCount:likesInit=0, viewerLiked:viewerLikedInit=false,
    } = post ?? {};

    const pics = photos.filter(Boolean);

    const [likes, setLikes]       = useState(likesInit);
    const [liked, setLiked]       = useState(viewerLikedInit);
    const [comments, setComments] = useState([]);
    const [loadingC, setLoadingC] = useState(false);
    const [expandedSet, setExpanded] = useState(()=>new Set());
    const [comment, setComment]   = useState('');
    const [imgLoaded, setImgLoaded] = useState(pics.length===0);
    const [idx, setIdx]           = useState(0);
    const [lightbox, setLightbox] = useState(false);
    const inputRef = useRef(null);

    /* fetch comments */
    useEffect(()=>{ if(!open||!postId) return;
        (async()=>{
            setLoadingC(true);
            try{ const r=await fetch(`/api/posts/${postId}/comments?category=community_post`);
                setComments(await r.json()); }catch(e){console.error(e);}
            setLoadingC(false);
        })();
    },[open,postId]);

    /* actions */
    const toggleLike = async ()=>{
        if(!currentUser){ openAuth(); return; }
        try{
            const r=await fetch(`/api/posts/${postId}/like`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({category:'community_post'}),
            });
            const j=await r.json();
            setLiked(j.liked);
            setLikes(v=>v+(j.liked?1:-1));
        }catch(e){console.error(e);}
    };

    const submitComment = async ()=>{
        const txt=comment.trim(); if(!txt) return;
        try{
            const r=await fetch(`/api/posts/${postId}/comments`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({content:txt}),
            });
            if(r.status===401){ openAuth(); return; }
            const newC=await r.json();
            setComments(a=>[...a,newC]);
            setComment('');
            inputRef.current?.focus();
        }catch(e){console.error(e);}
    };

    const toggleExpand = id => setExpanded(s=>{
        const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n;
    });

    /* derived data */
    const badge = lost_or_found
        ? { label: lost_or_found==='found'?'Found':'Lost', color:'#fb8c00', Icon:SearchIcon }
        : BADGE[category] ?? { label:category||'Other', color:'#777', Icon:ReportIcon };

    if(!open||!post) return null;

    const composerAvatar =
        currentUser?.profile_picture ||
        currentUser?.avatar_url      ||
        currentUser?.picture         ||
        '';

    /* render */
    return (
        <Dialog open={open} onClose={(_,r)=>r!=='backdropClick'&&onClose()}
                fullWidth maxWidth="xl"
                PaperProps={{ sx:{ height:'80vh', maxHeight:'80vh', overflow:'hidden' } }}>
            <DialogContent sx={{
                p:0, display:'flex', flexDirection:{xs:'column',md:'row'},
                height:{xs:'auto',md:'calc(100% - 54px)'}, position:'relative',
            }}>
                {!imgLoaded && <LoaderOverlay onClose={onClose}/>}

                {/* POST PANE */}
                <Box sx={{ flex:1, px:5, py:4, overflowY:'auto',
                    display:'flex', flexDirection:'column', gap:3 }}>
                    <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                        <Avatar src={avatar_url}>{first_name[0]}</Avatar>
                        <Box>
                            <Typography variant="subtitle1" fontWeight={600}>{first_name} {last_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{timeAgo(date_created)}</Typography>
                        </Box>
                    </Box>

                    {title && <Typography variant="h5" fontWeight={700}>{title}</Typography>}
                    <Pill {...badge}/>

                    <Box sx={{ display:'flex', flexDirection:{xs:'column',sm:'row'}, gap:3 }}>
                        <Box sx={{ flex:1, maxHeight:{xs:'unset',md:'40vh'}, overflowY:'auto', pr:1 }}>
                            <Typography variant="body1" sx={{ whiteSpace:'pre-line' }}>{description}</Typography>
                        </Box>
                        {pics.length>0 && (
                            <Box sx={{ width:300, flexShrink:0 }}>
                                <Gallery
                                    pics={pics}
                                    idx={idx}
                                    setIdx={setIdx}
                                    height={260}
                                    onImgLoad={()=>setImgLoaded(true)}
                                    onOpenLightbox={()=>setLightbox(true)}
                                />
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ display:'flex', gap:2 }}>
                        <Button startIcon={<FavoriteIcon color={liked?'error':'action'}/>}
                                sx={{ textTransform:'none', minWidth:64 }}
                                onClick={toggleLike}>{likes}</Button>
                        <Button startIcon={<CommentIcon/>}
                                sx={{ textTransform:'none', minWidth:64 }}
                                onClick={()=>document.getElementById('comment-input')?.focus()}>
                            {comments.length}
                        </Button>
                        <Button startIcon={<ShareIcon/>} sx={{ textTransform:'none', minWidth:64 }}>
                            0
                        </Button>
                    </Box>
                </Box>

                {/* COMMENTS PANE */}
                <Paper elevation={0} sx={{
                    width:{xs:'100%',md:380}, bgcolor:'grey.50',
                    borderLeft:{xs:0,md:'2px solid'}, borderColor:'divider',
                    boxShadow:{md:'inset 4px 0 6px -4px rgba(0,0,0,0.06)'},
                    display:'flex', flexDirection:'column',
                }}>
                    <Box sx={{ px:2, pt:2, pb:1, borderBottom:1, borderColor:'divider' }}>
                        <Typography variant="subtitle1" fontWeight={600}>
                            Comments ({comments.length})
                        </Typography>
                    </Box>

                    <Box sx={{ flex:1, overflowY:'auto', px:2, py:1 }}>
                        {loadingC ? (
                            <CircularProgress size={24}/>
                        ) : comments.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>
                                No comments yet.
                            </Typography>
                        ) : comments.map(c=>{
                            const content = c?.content ?? '';
                            const long    = content.length > 200;
                            const open    = expandedSet.has(c.id);
                            const display = open || !long ? content : `${content.slice(0,200)}…`;
                            return (
                                <Box key={c.id} sx={{ display:'flex', gap:1.25, mb:2 }}>
                                    <Avatar src={c.avatar_url}>{c.first_name?.[0]}</Avatar>
                                    <Box>
                                        <Typography variant="subtitle2">{c.first_name} {c.last_name}</Typography>
                                        <Typography variant="body2" sx={{
                                            whiteSpace:'pre-wrap', wordBreak:'break-word',
                                        }}>
                                            {display}
                                            {long && (
                                                <Button
                                                    size="small"
                                                    sx={{ textTransform:'none', ml:0.5, p:0, minWidth:0 }}
                                                    onClick={()=>toggleExpand(c.id)}
                                                >
                                                    {open ? 'less' : 'more'}
                                                </Button>
                                            )}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {timeAgo(c.created_at)}
                                        </Typography>
                                    </Box>
                                </Box>
                            );
                        })
                        }
                    </Box>

                    {/* composer */}
                    <Box sx={{
                        borderTop:1, borderColor:'divider', p:1,
                        display:'flex', flexDirection:'column', gap:0.5,
                    }}>
                        <Box sx={{ display:'flex', alignItems:'flex-start', gap:1 }}>
                            <Avatar
                                src={composerAvatar}
                                alt={currentUser?.first_name}
                                imgProps={{ onError:e=>{ e.currentTarget.src=''; } }}
                            >
                                {currentUser?.first_name?.[0] || ''}
                            </Avatar>

                            <Box sx={{
                                flex:1, display:'flex', alignItems:'flex-end',
                                border:1, borderColor:'divider', borderRadius:2, px:1,
                            }}>
                                <TextField
                                    id="comment-input"
                                    multiline
                                    fullWidth
                                    variant="standard"
                                    placeholder="Leave a comment"
                                    InputProps={{ disableUnderline:true }}
                                    inputRef={inputRef}
                                    value={comment}
                                    onChange={e=>setComment(e.target.value.slice(0,MAX_LEN))}
                                    minRows={1}
                                    maxRows={4}
                                    sx={{ flex:1 }}
                                />
                                <IconButton color="primary" disabled={comment.trim()===''} onClick={submitComment}>
                                    <SendIcon/>
                                </IconButton>
                            </Box>
                        </Box>
                        {comment.length>0 && (
                            <Typography variant="caption" align="right" sx={{ pr:1 }}>
                                {MAX_LEN - comment.length} characters left
                            </Typography>
                        )}
                    </Box>
                </Paper>
            </DialogContent>

            {/* bottom bar */}
            <Box sx={{
                borderTop:1, borderColor:'divider',
                px:3, py:1, display:'flex', justifyContent:'flex-end',
                bgcolor:'background.paper',
            }}>
                <Button onClick={onClose} variant="outlined">Close</Button>
            </Box>

            {/* light-box */}
            <Dialog open={lightbox} onClose={()=>setLightbox(false)} maxWidth="lg" fullWidth>
                <DialogContent sx={{ p:2, bgcolor:'grey.900', position:'relative' }}>
                    <IconButton
                        onClick={()=>setLightbox(false)}
                        sx={{ position:'absolute', top:8, right:8, color:'#fff' }}
                    >
                        <CloseIcon/>
                    </IconButton>
                    <Box sx={{ maxWidth:'100%', mx:'auto' }}>
                        <Gallery
                            pics={pics}
                            idx={idx}
                            setIdx={setIdx}
                            height="80vh"
                            onImgLoad={()=>{}}
                            onOpenLightbox={()=>{}}
                        />
                    </Box>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}

PostDetailModal.propTypes = {
    open       : PropTypes.bool.isRequired,
    post       : PropTypes.object,
    onClose    : PropTypes.func.isRequired,
    currentUser: PropTypes.shape({
        profile_picture: PropTypes.string,
        avatar_url    : PropTypes.string,
        picture       : PropTypes.string,
        first_name    : PropTypes.string,
    }),
};
