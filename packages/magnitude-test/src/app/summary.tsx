import React from 'react';
import { Text, Box, Spacer } from 'ink';
import { AllTestStates } from './types';
import { FailureDescriptor } from '../../../magnitude-core/src/common/failure'; // Import FailureDescriptor
import { FailureDisplay } from './failureDisplay'; // Import FailureDisplay

type TestSummaryProps = {
    testStates: AllTestStates;
};

// Show total in each status
// If we get an error, render a red box describing the failure instead (e.g. bug report or other error)
export const TestSummary = ({ testStates }: TestSummaryProps) => {
    // Calculate counts directly on each render
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

    // Collect all failures
    const failures: FailureDescriptor[] = Object.values(testStates)
        .map(state => state.failure)// as FailureDescriptor | undefined | null) // Cast for type safety
        .filter((failure) => failure && failure.variant !== 'cancelled') as FailureDescriptor[];
        //.filter((failure): failure is FailureDescriptor => failure !== undefined && failure !== null);

    return (
        <Box flexDirection="column" borderStyle="round" paddingX={1} width={80} borderColor={failures.length > 0 ? "red" : "grey"}>
            <Box>
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

            {failures.length > 0 && (<Box flexDirection='column' marginTop={1}>
                {failures.map((failure, index) => (
                    <Box key={index}>
                        <FailureDisplay failure={failure} />
                    </Box>
                ))}
            </Box>)}
        </Box>
    );
};
