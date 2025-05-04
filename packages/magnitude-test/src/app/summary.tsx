import React from 'react'; // Removed useMemo import
import { Text, Box, Spacer } from 'ink';
import { AllTestStates } from './types'; // Import type from index.tsx

type TestSummaryProps = {
    testStates: AllTestStates;
};

// Show total in each status
// If we get an error, render a red box describing the failure instead (e.g. bug report or other error)
export const TestSummary = ({ testStates }: TestSummaryProps) => {
    // Calculate counts directly on each render
    // TODO: show any failures in red box at bottom
    // TODO: show total token usage and cost

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const statusCounts = {
        pending: 0,
        running: 0,
        passed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
    };
    for (const state of Object.values(testStates)) {
        statusCounts.total++; // Use statusCounts directly
        switch (state.status) {
            case 'pending': statusCounts.pending++; break;
            case 'running': statusCounts.running++; break;
            case 'passed': statusCounts.passed++; break;
            case 'failed': statusCounts.failed++; break;
            case 'cancelled': statusCounts.cancelled++; break;
        }
        totalInputTokens += state.macroUsage.inputTokens;
        totalOutputTokens += state.macroUsage.outputTokens;
    }
    // Removed useMemo wrapper

    return (
        <Box borderStyle="round" paddingX={1} width={80} borderColor="grey">
            {statusCounts.passed > 0 && <Text color="green">✓ {statusCounts.passed} passed  </Text>}
            {statusCounts.failed > 0 && <Text color="red">✗ {statusCounts.failed} failed  </Text>}
            {statusCounts.running > 0 && <Text color="blueBright">▷ {statusCounts.running} running  </Text>}
            {statusCounts.pending > 0 && <Text color="gray">◌ {statusCounts.pending} pending  </Text>}
            {statusCounts.cancelled > 0 && <Text color="gray">⊘ {statusCounts.cancelled} cancelled  </Text>}

            <Spacer/>

            <Text color="gray">tokens: {totalInputTokens} in, {totalOutputTokens} out</Text> 

            {/* <Text color="gray">⇥ {totalInputTokens}  ∴ {totalOutputTokens}</Text> */}
            {/* <Text color="gray">⎆ {totalInputTokens}  ⎏ {totalOutputTokens}</Text> */}
            {/* <Text color="gray">{totalInputTokens} → ← {totalOutputTokens}</Text> */}
        </Box>
    );
};
