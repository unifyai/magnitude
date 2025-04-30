import React, {useState, useEffect} from 'react';
import {render, Text, Box, Spacer} from 'ink';
import { VERSION } from '@/version';
import { CategorizedTestCases, MagnitudeConfig, TestRunnable } from '@/discovery/types'; // Added TestRunnable import
import { describeModel } from '@/util';
import { TitleBar } from './title';

type AppProps = {
    config: Required<MagnitudeConfig>;
    tests: CategorizedTestCases;
}

// Helper component to render a single test item
const TestItem = ({ test }: { test: TestRunnable }) => (
    <Box marginLeft={2}>
        <Text>- {test.title}</Text>
    </Box>
);

// Helper component to render a group of tests
const TestGroupDisplay = ({ groupName, tests }: { groupName: string, tests: TestRunnable[] }) => (
    <Box flexDirection="column" marginLeft={1}>
        <Text italic>{groupName}</Text>
        {tests.map((test, index) => (
            <TestItem key={`${groupName}-${test.title}-${index}`} test={test} />
        ))}
    </Box>
);

export const App = ({ config, tests }: AppProps) => {
	const [counter, setCounter] = useState(0); // This counter seems unrelated to test rendering, leaving it for now

    

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter(previousCounter => previousCounter + 1);
		}, 100);

		return () => {
			clearInterval(timer);
		};
	}, []);

    //return <Text color="green">{counter} tests passed</Text>;

    return (
        <Box flexDirection='column'>
            <TitleBar version={VERSION} model={describeModel(config.planner)}/>
            <Box flexDirection="column" borderStyle="round" paddingX={1} width={80} borderColor="grey">
                {Object.entries(tests).map(([filepath, { ungrouped, groups }]) => (
                    <Box key={filepath} flexDirection="column" marginBottom={1}>
                        <Text bold>▶{"  "}{filepath}</Text> 

                        {ungrouped.length > 0 && (
                            <Box flexDirection="column" marginTop={1}>
                                {ungrouped.map((test, index) => (
                                    <TestItem key={`ungrouped-${test.title}-${index}`} test={test} />
                                ))}
                            </Box>
                        )}

                        {Object.entries(groups).length > 0 && (
                             <Box flexDirection="column" marginTop={1}>
                                {Object.entries(groups).map(([groupName, groupTests]) => (
                                    <TestGroupDisplay key={groupName} groupName={groupName} tests={groupTests} />
                                ))}
                            </Box>
                        )}
                    </Box>
                ))}
            </Box>
        </Box>
    );
};
