import React, {useState, useEffect} from 'react';
import {render, Text, Box, Spacer} from 'ink';
import { VERSION } from '@/version';
import { describeModel } from '@/util';

export const TitleBar = ({ version, model }: { version: string, model: string }) => (
    <Box borderStyle="round" paddingX={1} width={80} borderColor="blueBright">
        <Text bold color="blueBright">
            Magnitude{" "}<Text dimColor>v{version}</Text>
        </Text>
        <Spacer/>
        <Text color="grey" dimColor>{model}</Text>
    </Box>
)