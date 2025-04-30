import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink'; // Removed render, Spacer
import { VERSION } from '@/version';
import { CategorizedTestCases, MagnitudeConfig, TestRunnable } from '@/discovery/types';
import { describeModel } from '@/util';
import { TitleBar } from './title';
import Spinner from 'ink-spinner';
import { getUniqueTestId, formatDuration } from './util'; // Add util imports

// Export needed types
export type TestState = {
    status: 'pending' | 'running' | 'completed' | 'error';
    startTime?: number;
    duration?: number; // Final duration for completed/error states
    elapsedTime?: number; // Live elapsed time for running state
    error?: Error;
};

export type AllTestStates = Record<string, TestState>;

type AppProps = {
    config: Required<MagnitudeConfig>;
    tests: CategorizedTestCases;
    initialTestStates: AllTestStates; // Add prop for initial state
};

// --- TestDisplay Component (replaces TestItem) ---
type TestDisplayProps = {
    test: TestRunnable;
    state: TestState | undefined; // State for this specific test, includes elapsedTime if running
};

const TestDisplay = ({ test, state }: TestDisplayProps) => {
    // No internal state or useEffect for timer needed anymore

    const getStatusIndicator = () => {
        switch (state?.status) {
            case 'running':
                return <Spinner type="dots" />;
            case 'completed':
                return <Text color="green">✓</Text>;
            case 'error':
                return <Text color="red">✕</Text>;
            case 'pending':
            default:
                return <Text color="gray">◯</Text>;
        }
    };

    const getTimerText = () => {
        if (state?.status === 'running') {
            // Display elapsedTime passed via props
            return `(${formatDuration(state.elapsedTime)})`;
        }
        if (state?.status === 'completed' || state?.status === 'error') {
            // Display final duration passed via props
            return `(${formatDuration(state.duration)})`;
        }
        return '';
    };

    return (
        <Box flexDirection="column" marginLeft={2}>
            <Box>
                {getStatusIndicator()}
                <Text> {test.title} </Text>
                <Text color="gray">{getTimerText()}</Text>
            </Box>
            {state?.status === 'error' && state.error && (
                <Box marginLeft={2}>
                    <Text color="red">↳ {state.error.message}</Text>
                </Box>
            )}
        </Box>
    );
};


// --- TestGroupDisplay Component ---
// Update to accept all states and pass the correct slice down
type TestGroupDisplayProps = {
    groupName: string;
    tests: TestRunnable[];
    filepath: string; // Need filepath to generate unique IDs
    testStates: AllTestStates; // Pass down all states
};

const TestGroupDisplay = ({ groupName, tests, filepath, testStates }: TestGroupDisplayProps) => (
    <Box flexDirection="column">
        <Text>  [ {groupName} ]</Text>
        <Box marginLeft={2} marginTop={1} flexDirection="column">
            {tests.map((test) => {
                const testId = getUniqueTestId(filepath, groupName, test.title);
                // Pass the specific state for this test down to TestDisplay
                return <TestDisplay key={testId} test={test} state={testStates[testId]} />;
            })}
        </Box>
    </Box>
);

// --- App Component ---
// Update to use initialTestStates and pass state down correctly
export const App = ({ config, tests, initialTestStates }: AppProps) => {
    // Remove the unrelated counter state and effect
	// const [counter, setCounter] = useState(0);
	// useEffect(() => {
	// 	const timer = setInterval(() => {
	// 		setCounter(previousCounter => previousCounter + 1);
	// 	}, 100);
	// 	return () => {
	// 		clearInterval(timer);
	// 	};
	// }, []);

    // Directly use the state object passed via props
    const testStates = initialTestStates;

    return (
        <Box flexDirection='column'>
            <TitleBar version={VERSION} model={describeModel(config.planner)}/>
            <Box flexDirection="column" borderStyle="round" paddingX={1} width={80} borderColor="grey">
                {Object.entries(tests).map(([filepath, { ungrouped, groups }]) => (
                    <Box key={filepath} flexDirection="column" marginBottom={1}>
                        <Text bold>☰{"  "}{filepath}</Text>

                        {/* Render Ungrouped Tests */}
                        {ungrouped.length > 0 && (
                            <Box flexDirection="column" marginTop={1}>
                                {ungrouped.map((test) => {
                                    const testId = getUniqueTestId(filepath, null, test.title);
                                    // Pass the specific state for this test
                                    return <TestDisplay key={testId} test={test} state={testStates[testId]} />;
                                })}
                            </Box>
                        )}

                        {/* Render Grouped Tests */}
                        {Object.entries(groups).length > 0 && (
                             <Box flexDirection="column" marginTop={1}>
                                {Object.entries(groups).map(([groupName, groupTests]) => (
                                    // Pass filepath and all states to TestGroupDisplay
                                    <TestGroupDisplay
                                        key={groupName}
                                        groupName={groupName}
                                        tests={groupTests}
                                        filepath={filepath}
                                        testStates={testStates}
                                    />
                                ))}
                            </Box>
                        )}
                    </Box>
                ))}
            </Box>
        </Box>
    );
};
