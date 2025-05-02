import { useState, useEffect } from 'react'; // Removed useMemo import
import { Text, Box } from 'ink';
import { TestRunnable } from '@/discovery/types';
import Spinner from 'ink-spinner';
import { formatDuration } from './util';
import { TestState } from './types';
import { ActionDescriptor } from 'magnitude-core';

type TestDisplayProps = {
    test: TestRunnable;
    state: TestState;
};

function describeAction(action: ActionDescriptor) {
    switch (action.variant) {
        case 'load':
            return `navigated to URL: ${action.url}`;
        case 'click':
            return `clicked ${action.target}`;
        case 'type':
            return `typed "${action.content}" into ${action.target}`;
        case 'scroll':
            return `scrolled (${action.deltaX}, ${action.deltaY})`;
        default:
            throw Error(`Unhandled action variant in describeAction: ${(action as any).variant}`);
    }
}

function getActionSymbol(variant: "load" | "click" | "hover" | "type" | "scroll" | "wait" | "back") {
    switch (variant) {
        case "load":
            return "↻"; // Recycling symbol for loading
        case "click":
            return "⊙"; // Circled dot for clicking
        case "hover":
            return "◉"; // Circled bullet for hovering
        case "type":
            return "⏎"; // Keyboard symbol
        case "scroll":
            return "↕"; // Up/down arrows for scrolling
        case "wait":
            return "◴"; // Clock face for waiting
        case "back":
            return "←"; // Left arrow for going back
        default:
            return "?"; // Question mark for unknown action
    }
}

export const TestDisplay = ({ test, state }: TestDisplayProps) => {
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

    const getTestStatusIndicator = (status: 'running' | 'passed' | 'failed' | 'pending') => {
        switch (status) {
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

    const getStepStatusIndicator = (status: 'running' | 'passed' | 'failed' | 'pending') => {
        switch (status) {
            case 'running':
                return <Text color="grey">{'>'}</Text>;//<Spinner type="layer" />;
            case 'passed':
                return <Text color="blueBright">⚑</Text>;
            case 'failed':
                return <Text color="red">✕</Text>;
            case 'pending':
            default:
                return <Text color="gray">•</Text>;
        }
    };

    const getCheckStatusIndicator = (status: 'running' | 'passed' | 'failed' | 'pending') => {
        switch (status) {
            case 'running':
                return <Text color="grey">?</Text>; //<Spinner type="layer" />;//<Text>?</Text>;//<Spinner type="toggle10" />;
            case 'passed':
                return <Text color="blueBright">✓</Text>;
            case 'failed':
                return <Text color="red">✕</Text>;
            case 'pending':
            default:
                return <Text color="gray">•</Text>;
        }
    };

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
        let failurePrefix = {
            'unknown': '',
            'browser': 'BrowserError: ',
            'network': 'NetworkError: ',
            'misalignment': 'Misalignment: '
        }[failure.variant];
        failureContent = <Text color="red">↳ {failurePrefix}{failure.message}</Text>;
    }

    return (
        <Box flexDirection="column" marginLeft={2}>
            <Box>
                {getTestStatusIndicator(state.status)}
                <Text> {test.title} </Text>
                <Text color="gray">{getTimerText()}</Text>
            </Box>
            {state.stepsAndChecks.length > 0 && (
                <Box flexDirection="column" marginLeft={2}>
                    {state.stepsAndChecks.map(item => {
                        if (item.variant === 'step') {
                            if (item.actions.length > 0) {
                                return (<Box flexDirection='column' key={'step:'+item.description+item.status}>
                                    <Text>{getStepStatusIndicator(item.status)} {item.description}</Text>
                                    <Box flexDirection='column' marginLeft={2}>
                                        {item.actions.map(action => (
                                            <Box key={JSON.stringify(action)}>
                                                <Box width={1} height={1}>
                                                    <Text color="grey">{getActionSymbol(action.variant)}</Text>
                                                </Box>

                                                <Box marginLeft={1}>
                                                    <Text color="grey">{describeAction(action)}</Text>
                                                </Box>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>);
                            } else {
                                return <Text key={'step:'+item.description+item.status}>{getStepStatusIndicator(item.status)} {item.description}</Text>
                            }
                            
                        } else {
                            return <Text key={'check:'+item.description+item.status}>{getCheckStatusIndicator(item.status)} {item.description}</Text>
                        }
                    })}
                </Box>
            )}
            {failure && (
                <Box marginLeft={2}>
                    {failureContent}
                </Box>
            )}
        </Box>
    );
};

