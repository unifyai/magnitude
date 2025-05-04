import React from 'react';
import { Text, Box, Newline } from 'ink';
import { FailureDescriptor } from '../../../magnitude-core/src/common/failure'; // Use correct type name

type FailureDisplayProps = {
    failure: FailureDescriptor; // Use correct type name
};

export const FailureDisplay = ({ failure }: FailureDisplayProps) => {
    if (failure.variant === 'bug') {
        return (<Box>
            <Box>
                <Text color="red">↳{" "}</Text>
            </Box>
            <Box flexDirection='column' marginLeft={1}>
                <Text>
                    <Text color="red">Found bug: </Text><Text bold>{failure.title}</Text>
                    <Newline/>
                    <Text color="red">Expected: </Text><Text>{failure.expectedResult}</Text>
                    <Newline/>
                    <Text color="red">Actual: </Text><Text>{failure.actualResult}</Text>
                    <Newline/>
                    <Text color="red">Severity: </Text><Text>{failure.severity.toUpperCase()}</Text>
                </Text>
            </Box>
        </Box>);
    } else if (failure.variant === 'cancelled') {
        return (<Box>
            <Box>
                <Text color="grey">↳{" "}</Text>
            </Box>
            <Box marginLeft={1}>
                <Text color="grey">Cancelled</Text>
            </Box>
        </Box>);
    } else {
        const prefixMap: Partial<Record<FailureDescriptor['variant'], string>> = {
            'unknown': '',
            'browser': 'BrowserError: ',
            'network': 'NetworkError: ',
            'misalignment': 'Misalignment: '
        };
        const failurePrefix = prefixMap[failure.variant];

        return (<Box>
            <Box>
                <Text color="red">↳{" "}</Text>
            </Box>
            <Box marginLeft={1}>
                <Text color="red">{failurePrefix}{failure.message}</Text>
            </Box>
        </Box>);
    }
};
