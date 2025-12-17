// src/components/Header/TabBar.jsx
// ---------------------------------------------------------------
// Generic tab bar that now accepts **either** plain strings OR
// objects shaped like { value: string, label: ReactNode }.
// The parent (Header.jsx) can therefore inject icons or other
// rich content into labels without breaking anything.
//
// Update:
// - Treats "no active tab" as a valid state (value=false) so nothing
//   is selected when on non-tabbed routes (e.g., profile pages).
// - Hides the Tabs indicator line entirely when nothing is selected.
// ---------------------------------------------------------------

import React from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';

/**
 * Extract the tab's unique value (always a string).
 * @param {string|{value:string,label:React.ReactNode}} t
 * @returns {string}
 */
const getValue = (t) => (typeof t === 'string' ? t : t.value);

/**
 * Extract the tab's display label (string or React node).
 * @param {string|{value:string,label:React.ReactNode}} t
 * @returns {React.ReactNode}
 */
const getLabel = (t) => (typeof t === 'string' ? t : t.label);

/**
 * @param {Object}   props
 * @param {Array}    props.tabs        - Array of strings OR {value,label} objects
 * @param {string}   props.activeTab   - The current tab's **value** string
 * @param {Function} props.onTabChange - (newValueString) => void
 */
export default function TabBar({ tabs, activeTab, onTabChange }) {
    // Map the active string value to its index for MUI's <Tabs>
    const activeIndex = tabs.findIndex((t) => getValue(t) === activeTab);
    const noSelection = activeIndex === -1; // when parent intentionally clears activeTab

    // When the user clicks a tab, MUI gives us the new index → resolve to value
    const handleChange = (_event, newIndex) => {
        const tab = tabs[newIndex];
        onTabChange(getValue(tab));
    };

    return (
        <Box sx={{ flexGrow: 1 }}>
            <Tabs
                // If there's no active tab, set value to `false` (no selection)
                value={noSelection ? false : activeIndex}
                onChange={handleChange}
                variant="scrollable"
                scrollButtons="auto"
                aria-label="Main navigation tabs"
                sx={{
                    minHeight: 0,
                    '& .MuiTab-root': {
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: 16,
                        minHeight: 0,
                        minWidth: 80,
                        px: 2,
                    },
                    '& .Mui-selected': {
                        fontWeight: 700,
                        color: 'primary.main',
                    },
                    // Hide the moving underline when nothing is selected
                    ...(noSelection ? { '& .MuiTabs-indicator': { display: 'none' } } : {}),
                }}
            >
                {tabs.map((t, idx) => (
                    <Tab key={getValue(t)} value={idx} label={getLabel(t)} />
                ))}
            </Tabs>
        </Box>
    );
}
