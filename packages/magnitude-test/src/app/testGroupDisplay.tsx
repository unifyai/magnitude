import { Text, Box } from 'ink';
import { TestRunnable } from '@/discovery/types';
import { getUniqueTestId } from './util';
import { AllTestStates } from './types';
import { TestDisplay } from './testDisplay';

type TestGroupDisplayProps = {
    groupName: string;
    tests: TestRunnable[];
    filepath: string;
    testStates: AllTestStates;
};

export const TestGroupDisplay = ({ groupName, tests, filepath, testStates }: TestGroupDisplayProps) => (
    <Box flexDirection="column" marginLeft={2}>
        <Text bold color="blueBright">{groupName}</Text>
        <Box  flexDirection="column">
            {tests.map((test) => {
                const testId = getUniqueTestId(filepath, groupName, test.title);
                return <TestDisplay key={testId} test={test} state={testStates[testId]} />;
            })}
        </Box>
    </Box>
);