// src/pages/NotFound.jsx
import React from 'react';
import { Box, Button, Container, Paper, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
    const navigate = useNavigate();
    return (
        <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
            <Paper elevation={1} sx={{ p: { xs: 3, sm: 6 }, textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                    Page not found
                </Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
                    We couldn’t find the page you were looking for. It may have been moved or deleted.
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Button variant="contained" onClick={() => navigate('/')}>
                        Go to Home
                    </Button>
                    <Button variant="outlined" onClick={() => navigate('/register')}>
                        Create an Account
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
}
