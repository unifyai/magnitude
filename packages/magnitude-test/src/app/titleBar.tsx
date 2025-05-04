import React, {useState, useEffect} from 'react';
import {render, Text, Box, Spacer} from 'ink';
import { VERSION } from '@/version';

export const TitleBar = ({ version, model }: { version: string, model: string }) => (
    <Box borderStyle="round" paddingX={1} borderColor="blueBright">
        <Box marginRight={1}>
            <Text bold color="blueBright">
                Magnitude{" "}<Text dimColor>v{version}</Text>
            </Text>
        </Box>
        <Spacer/>
        <Text color="grey" dimColor>{model}</Text>
    </Box>
)