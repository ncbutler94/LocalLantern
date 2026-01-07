import React, { useState, useRef, useEffect } from 'react';
import PropTypes                   from 'prop-types';
import { Box, Paper, TextField, Avatar, IconButton, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import StrikethroughS from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import FormatQuote from '@mui/icons-material/FormatQuote';

const MAX_CHARS = 1000;
const surround = (src, tag) => `${tag}${src}${tag}`;

export default function ReplyEditor({
                                        avatar,
                                        onSubmit,
                                        autoFocus = false,
                                        placeholder = 'Write a reply…',
                                        fullWidth = false // pass true for the main composer to span the footer
                                    }) {
    const [txt,  setTxt]  = useState('');
    const [file, setFile] = useState(null);
    const iptRef          = useRef();

    useEffect(() => {
        if (autoFocus && iptRef.current) {
            iptRef.current.focus();
            const t = setTimeout(() => iptRef.current?.focus(), 20);
            return () => clearTimeout(t);
        }
    }, [autoFocus]);

    const wrap = (tag) => {
        if (!iptRef.current) return;
        const el    = iptRef.current;
        const start = el.selectionStart;
        const end   = el.selectionEnd;
        const sel   = txt.slice(start, end) || 'text';
        const next  = txt.slice(0, start) + surround(sel, tag) + txt.slice(end);
        setTxt(next);
        setTimeout(() => el.setSelectionRange(start + tag.length, end + tag.length));
    };

    const choose = (e) => {
        const f = e.target.files[0];
        if (f) setFile(Object.assign(f, { preview: URL.createObjectURL(f) }));
    };

    const go = () => {
        const content = txt.trim();
        if (!content && !file) return;
        const form = new FormData();
        form.append('content', content);
        if (file) form.append('image', file);
        onSubmit(form, () => { setTxt(''); setFile(null); });
    };

    return (
        <Box sx={{ display:'flex', gap:1, mt:1, minWidth: 0 }}>
            <Avatar src={avatar} sx={{ bgcolor: 'grey.600', width:32, height:32 }} />
            <Paper
                variant="outlined"
                sx={{
                    p:1,
                    flex: fullWidth ? '1 1 auto' : '0 0 auto',
                    minWidth: fullWidth ? 0 : 420,
                    width: fullWidth ? '100%' : 'min(560px, 52vw)'
                }}
            >
                <Box sx={{ display:'flex', gap:1, mb:1, alignItems:'center', flexWrap:'wrap' }}>
                    {[['**', <FormatBold/>], ['_',<FormatItalic/>], ['~~',<StrikethroughS/>], ['`',<CodeIcon/>], ['> ',<FormatQuote/>]]
                        .map(([tag, icon]) => (
                            <Tooltip key={tag} title={tag==='> ' ? 'Quote' : 'Wrap'}>
                                <IconButton size="small" onClick={()=>wrap(tag)}>{icon}</IconButton>
                            </Tooltip>
                        ))}
                    <IconButton size="small" component="label">
                        <ImageIcon/>
                        <input hidden type="file" accept="image/*" onChange={choose}/>
                    </IconButton>

                    <Box sx={{ ml:'auto', display:'inline-flex', alignItems:'center', gap:0.5 }}>
                        <Typography variant="caption">{MAX_CHARS - txt.length}</Typography>
                        <IconButton color="primary" disabled={!txt.trim() && !file} onClick={go}><SendIcon/></IconButton>
                    </Box>
                </Box>

                <TextField
                    inputRef={iptRef}
                    multiline fullWidth variant="standard"
                    placeholder={placeholder}
                    value={txt}
                    onChange={(e)=>setTxt(e.target.value.slice(0,MAX_CHARS))}
                    InputProps={{ disableUnderline:true }}
                    minRows={2} maxRows={6}
                    autoFocus={autoFocus}
                />

                {file && (
                    <Box component="img" src={file.preview} alt="" sx={{ width:120, mt:1, borderRadius:1 }}/>
                )}
            </Paper>
        </Box>
    );
}
ReplyEditor.propTypes = {
    avatar:     PropTypes.string,
    onSubmit:   PropTypes.func.isRequired,
    autoFocus:  PropTypes.bool,
    placeholder:PropTypes.string,
    fullWidth:  PropTypes.bool,
};
