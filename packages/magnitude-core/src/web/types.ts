export interface Screenshot {
    // b64-encoded PNG image
    image: string,
    dimensions: {
        width: number,
        height: number
    }
}

// export interface WebAction {
//     variant: ActionVariant
// }

export type WebAction = NavigateWebAction | ClickWebAction | TypeWebAction;

// Currently only emitted synthetically
export interface NavigateWebAction {
    variant: 'load'
    url: string
}

export interface ClickWebAction {
    variant: 'click'
    x: number
    y: number
}

export interface TypeWebAction {
    variant: 'type'
    x: number
    y: number
    content: string
}

// export type ActionVariant = 'click' | 'type';


export interface PixelCoordinate {
    x: number,
    y: number
}

// for back-compat, not all implemented yet

