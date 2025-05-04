import React, { useState, useEffect } from 'react'; // <-- Import useState and useEffect
import { Text, Box, useStdout } from 'ink';
import { VERSION } from '@/version';
import { CategorizedTestCases } from '@/discovery/types';
import { TitleBar } from './titleBar';
import { getUniqueTestId } from './util';
import { TestSummary } from './summary';
import { AllTestStates } from './types';
import { TestGroupDisplay } from './testGroupDisplay';
import { TestDisplay } from './testDisplay';

export * from './types';

// --- Configuration for Debounced Width ---
const MAX_APP_WIDTH = 100; // max rendered width
const RESIZE_DEBOUNCE_MS = 50; // Delay after resize stops (milliseconds)
// ---

const getInitialWidth = (): number => {
    try {
        // Check if process.stdout.columns is available and is a number
        if (typeof process?.stdout?.columns === 'number') {
            // Use the smaller of actual columns or the max limit
            return Math.min(process.stdout.columns, MAX_APP_WIDTH);
        }
    } catch (e) {
        // Ignore potential errors accessing process.stdout in some environments
    }
    // Fallback to the maximum width if direct access fails
    return MAX_APP_WIDTH;
};

type AppProps = {
    model: string;
    tests: CategorizedTestCases;
    testStates: AllTestStates;
};

export const App = ({ model, tests, testStates }: AppProps) => {
    const { stdout } = useStdout();

    // State to hold the calculated width that will be applied to the main Box
    const [appWidth, setAppWidth] = useState(getInitialWidth);

    useEffect(() => {
        // Calculates the desired width based on terminal size and the limit
        const calculateAndUpdateWidth = () => {
            const currentTerminalWidth = stdout?.columns || MAX_APP_WIDTH;
            setAppWidth(Math.min(currentTerminalWidth, MAX_APP_WIDTH));
        };

        // Initial calculation on mount
        calculateAndUpdateWidth();

        // --- Debounce Logic ---
        let debounceTimeoutId: NodeJS.Timeout | null = null;

        const handleResize = () => {
            if (debounceTimeoutId) {
                clearTimeout(debounceTimeoutId);
            }
            debounceTimeoutId = setTimeout(() => {
                calculateAndUpdateWidth();
            }, RESIZE_DEBOUNCE_MS);
        };

        // Subscribe to terminal resize events
        stdout?.on('resize', handleResize);

        return () => {
            stdout?.off('resize', handleResize);
            if (debounceTimeoutId) {
                clearTimeout(debounceTimeoutId);
            }
        };
    }, [stdout]); // Re-run effect if stdout instance changes

    return (
        <Box flexDirection='column' width={appWidth}>

            <TitleBar version={VERSION} model={model} />
            <Box
                flexDirection="column"
                borderStyle="round"
                paddingLeft={1}
                paddingRight={3}
                borderColor="grey"
            >
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
            <TestSummary tests={tests} testStates={testStates} />
        </Box>
    );
};