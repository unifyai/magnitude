import React, { useState, useEffect } from 'react'; // Removed useMemo import
import { Text, Box } from 'ink';
import { VERSION } from '@/version';
import { CategorizedTestCases, MagnitudeConfig, TestRunnable } from '@/discovery/types';
import { describeModel } from '@/util';
import { TitleBar } from './title';
import Spinner from 'ink-spinner';
import { getUniqueTestId, formatDuration } from './util';
import { TestSummary } from './summary'; // Import TestSummary
import { AgentState } from 'magnitude-core';

export type TestState = {
    status: 'pending' | 'running' | 'passed' | 'failed';
    //startTime?: number;
    //error?: Error;
} & AgentState;

export type AllTestStates = Record<string, TestState>; 

type AppProps = {
    //config: Required<MagnitudeConfig>;
    model: string,
    tests: CategorizedTestCases;
    testStates: AllTestStates;
};

type TestDisplayProps = {
    test: TestRunnable;
    state: TestState;
};

const TestDisplay = ({ test, state }: TestDisplayProps) => {
    const [elapsedTime, setElapsedTime] = useState<number>(0);

    useEffect(() => {
        let intervalId: NodeJS.Timeout | undefined;

        if (state?.status === 'running' && state.startedAt) {
            const updateElapsed = () => setElapsedTime(Date.now() - (state.startedAt ?? Date.now()));
            intervalId = setInterval(updateElapsed, 100);
        } else {
            // Clear interval if status is not 'running'
            if (intervalId) { // Should ideally access via ref if strict mode causes double invoke
                clearInterval(intervalId);
                intervalId = undefined;
            }
        }

        // Cleanup function
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
        // Depend on specific properties that dictate the timer's behavior.
    }, [state?.status, state?.startedAt]);

    const getStatusIndicator = () => {
        switch (state?.status) {
            case 'running':
                return <Spinner type="dots" />;
            case 'passed':
                return <Text color="green">✓</Text>;
            case 'failed':
                return <Text color="red">✕</Text>;
            case 'pending':
            default:
                return <Text color="gray">◯</Text>;
        }
    };

    // if (!state) {
    //     return (
    //         <Box flexDirection="column" marginLeft={2}>
    //             <Box>
    //                 {getStatusIndicator()}
    //                 <Text> {test.title} </Text>
    //             </Box>
    //         </Box>
    //     );
    // }

    const getTimerText = () => {
        // Only show live elapsed time while running
        if (state?.status !== 'pending') {
            const tokenInfo = state.macroUsage.inputTokens > 0 ? ` [${state.macroUsage.inputTokens} tok]` : '';
            return `[${formatDuration(elapsedTime)}]${tokenInfo}`;
        }
        // Return empty string otherwise (no final duration shown)
        return '';
    };

    const failure = state.failure;

    let failureContent: JSX.Element | null = null;
    if (!failure) {
        failureContent = null;
    } else if (failure.variant === 'bug') {
        // TODO: bug render
        failureContent = <Text color="red">↳ Found bug:</Text>;
    } else {
        let failureTitle = {
            'unknown': 'UnexpectedError',
            'browser': 'BrowserError',
            'network': 'NetworkError',
            'misalignment': 'Misalignment'
        }[failure.variant];
        failureContent = <Text color="red">↳ {failureTitle}: {failure.message}</Text>;
    } 
    
    // else if (failure.variant === 'browser') {
    //     failureContent = <Text color="red">↳ UNKNOWN FAILURE AHHHHH</Text>;
    // } else if (failure.variant === ) {
    //     failureContent = <Text color="red">↳ UNKNOWN FAILURE AHHHHH</Text>;
    // } else if (failure.variant === 'browser') {
    //     failureContent = <Text color="red"></Text>;
    // }

    return (
        <Box flexDirection="column" marginLeft={2}>
            <Box>
                {getStatusIndicator()}
                <Text> {test.title} </Text>
                <Text color="gray">{getTimerText()}</Text>
            </Box>
            {failure && (
                <Box marginLeft={2}>
                    {failureContent}
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
        <Text bold color="blueBright">  [ {groupName} ]</Text>
        <Box marginLeft={2} marginTop={1} flexDirection="column">
            {tests.map((test) => {
                const testId = getUniqueTestId(filepath, groupName, test.title);
                return <TestDisplay key={testId} test={test} state={testStates[testId]} />;
            })}
        </Box>
    </Box>
);

export const App = ({ model, tests, testStates }: AppProps) => {


    // Removed statusCounts calculation (moved to TestSummary)

    return (
        <Box flexDirection='column'>
            <TitleBar version={VERSION} model={model}/>
            <Box flexDirection="column" borderStyle="round" paddingX={1} width={80} borderColor="grey">
                {Object.entries(tests).map(([filepath, { ungrouped, groups }]) => (
                    <Box key={filepath} flexDirection="column" marginBottom={1}>
                        <Text bold color="blueBright">☰{"  "}{filepath}</Text>

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
