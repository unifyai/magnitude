import React, {useState, useEffect} from 'react';
import {render, Text, Box, Spacer} from 'ink';
import { VERSION } from '@/version';
import { MagnitudeConfig } from '@/discovery/types';
import { describeModel } from '@/util';

type AppProps = {
    config: Required<MagnitudeConfig>;
}

export const App = ({ config }: AppProps) => {
	const [counter, setCounter] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter(previousCounter => previousCounter + 1);
		}, 100);

		return () => {
			clearInterval(timer);
		};
	}, []);

	//return <Text color="green">{counter} tests passed</Text>;

    return <Box flexDirection='column'>
        <Box borderStyle="round" paddingX={1} borderColor="blueBright">
            <Text bold color="blueBright">
                Magnitude{" "}<Text dimColor>v{VERSION}</Text>

                

                
            </Text>
            <Spacer/>
            <Text color="grey" dimColor>{describeModel(config.planner)}</Text>
        </Box>
        <Text color="green">{counter} tests passed</Text>
    </Box>
};
