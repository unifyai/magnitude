import React from 'react';
import { Text, Box, Spacer } from 'ink';
import { AllTestStates } from './types';
import { FailureDescriptor } from '../../../magnitude-core/src/common/failure';
import { FailureDisplay } from './failureDisplay';
import { CategorizedTestCases } from '@/discovery/types';
import { getUniqueTestId } from './util';

type TestSummaryProps = {
    tests: CategorizedTestCases;
    testStates: AllTestStates;
};

// Show total in each status
// If we get an error, render a red box describing the failure instead (e.g. bug report or other error)
export const TestSummary = ({ tests, testStates }: TestSummaryProps) => { // Add tests to props destructuring
    // Build context map
    const testContextMap = new Map<string, { filepath: string; groupName: string | null; testTitle: string }>();
    Object.entries(tests).forEach(([filepath, { ungrouped, groups }]) => {
        ungrouped.forEach(test => {
            const testId = getUniqueTestId(filepath, null, test.title);
            testContextMap.set(testId, { filepath, groupName: null, testTitle: test.title });
        });
        Object.entries(groups).forEach(([groupName, groupTests]) => {
            groupTests.forEach(test => {
                const testId = getUniqueTestId(filepath, groupName, test.title);
                testContextMap.set(testId, { filepath, groupName, testTitle: test.title });
            });
        });
    });

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

    type FailureWithContext = {
        filepath: string;
        groupName: string | null;
        testTitle: string;
        failure: FailureDescriptor;
    };
    const failuresWithContext: FailureWithContext[] = [];
    Object.entries(testStates).forEach(([testId, state]) => {
        if (state.failure && state.failure.variant !== 'cancelled') {
            const context = testContextMap.get(testId);
            if (context) {
                failuresWithContext.push({
                    ...context,
                    failure: state.failure as FailureDescriptor
                });
            } else {
                failuresWithContext.push({
                    filepath: 'Unknown File',
                    groupName: null,
                    testTitle: 'Unknown Test',
                    failure: state.failure as FailureDescriptor
                });
            }
        }
    });

    const failures = failuresWithContext;

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
                {failures.map(({ filepath, groupName, testTitle, failure }, index) => {
                    const contextString = `${filepath}${groupName ? ` > ${groupName}` : ''} > ${testTitle}`;
                    return (
                        <Box key={index} flexDirection="column" marginTop={index > 0 ? 1 : 0}>
                            <Text dimColor>{contextString}</Text>
                            <FailureDisplay failure={failure} />
                        </Box>
                    );
                })}
            </Box>)}
        </Box>
    );
};
