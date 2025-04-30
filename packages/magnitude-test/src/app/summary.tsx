import React from 'react'; // Removed useMemo import
import { Text, Box } from 'ink';
import { AllTestStates } from './index'; // Import type from index.tsx

type TestSummaryProps = {
    testStates: AllTestStates;
};

// Show total in each status
// If we get an error, render a red box describing the failure instead (e.g. bug report or other error)
export const TestSummary = ({ testStates }: TestSummaryProps) => {
    // Calculate counts directly on each render
    const statusCounts = {
        pending: 0,
        running: 0,
        completed: 0,
        error: 0,
        total: 0,
    };
    for (const state of Object.values(testStates)) {
        statusCounts.total++; // Use statusCounts directly
        switch (state.status) {
            case 'pending': statusCounts.pending++; break;
            case 'running': statusCounts.running++; break;
            case 'completed': statusCounts.completed++; break;
            case 'error': statusCounts.error++; break;
        }
    }
    // Removed useMemo wrapper

    return (
        <Box borderStyle="round" paddingX={1} width={80} borderColor="grey">
            <Text color="green">✓ {statusCounts.completed} passed  </Text>
            <Text color="red">✗ {statusCounts.error} failed  </Text>
            <Text color="blueBright">◌ {statusCounts.running} running  </Text>
            <Text color="gray">◯ {statusCounts.pending} pending</Text>
        </Box>
    );
};
