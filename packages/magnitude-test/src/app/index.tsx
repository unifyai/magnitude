import React, { useState, useEffect } from 'react'; // Removed useMemo import
import { Text, Box } from 'ink';
import { VERSION } from '@/version';
import { CategorizedTestCases, MagnitudeConfig, TestRunnable } from '@/discovery/types';
import { describeModel } from '@/util';
import { TitleBar } from './title';
import Spinner from 'ink-spinner';
import { getUniqueTestId, formatDuration } from './util';
import { TestSummary } from './summary'; // Import TestSummary

export type TestState = {
    status: 'pending' | 'running' | 'completed' | 'error';
    startTime?: number;
    duration?: number;
    error?: Error;
};

export type AllTestStates = Record<string, TestState>; 

type AppProps = {
    config: Required<MagnitudeConfig>;
    tests: CategorizedTestCases;
    initialTestStates: AllTestStates;
};

type TestDisplayProps = {
    test: TestRunnable;
    state: TestState | undefined;
};

const TestDisplay = ({ test, state }: TestDisplayProps) => {

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
        if (state?.status === 'completed' || state?.status === 'error') {
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

type TestGroupDisplayProps = {
    groupName: string;
    tests: TestRunnable[];
    filepath: string;
    testStates: AllTestStates;
};

const TestGroupDisplay = ({ groupName, tests, filepath, testStates }: TestGroupDisplayProps) => (
    <Box flexDirection="column">
        <Text>  [ {groupName} ]</Text>
        <Box marginLeft={2} marginTop={1} flexDirection="column">
            {tests.map((test) => {
                const testId = getUniqueTestId(filepath, groupName, test.title);
                return <TestDisplay key={testId} test={test} state={testStates[testId]} />;
            })}
        </Box>
    </Box>
);

export const App = ({ config, tests, initialTestStates }: AppProps) => {

    const testStates = initialTestStates;

    // Removed statusCounts calculation (moved to TestSummary)

    return (
        <Box flexDirection='column'>
            <TitleBar version={VERSION} model={describeModel(config.planner)}/>
            <Box flexDirection="column" borderStyle="round" paddingX={1} width={80} borderColor="grey">
                {Object.entries(tests).map(([filepath, { ungrouped, groups }]) => (
                    <Box key={filepath} flexDirection="column" marginBottom={1}>
                        <Text bold>☰{"  "}{filepath}</Text>

                        {ungrouped.length > 0 && (
                            <Box flexDirection="column" marginTop={1}>
                                {ungrouped.map((test) => {
                                    const testId = getUniqueTestId(filepath, null, test.title);
                                    return <TestDisplay key={testId} test={test} state={testStates[testId]} />;
                                })}
                            </Box>
                        )}

                        {Object.entries(groups).length > 0 && (
                             <Box flexDirection="column" marginTop={1}>
                                {Object.entries(groups).map(([groupName, groupTests]) => (
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
            <TestSummary testStates={testStates} />
        </Box>
    );
};
