import { Text, Box } from 'ink';
import { VERSION } from '@/version';
import { CategorizedTestCases } from '@/discovery/types';
import { TitleBar } from './titleBar';
import { getUniqueTestId } from './util';
import { TestSummary } from './summary';
import { AllTestStates } from './types';
import { TestGroupDisplay } from './testGroupDisplay';
import { TestDisplay } from './testDisplay';

export * from './types';


type AppProps = {
    model: string,
    tests: CategorizedTestCases;
    testStates: AllTestStates;
};


export const App = ({ model, tests, testStates }: AppProps) => {
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
            <TestSummary tests={tests} testStates={testStates} />
        </Box>
    );
};
