export interface FacebookOpenIdProfile {
    id: string;
    name: string;
    picture: {
        data: {
            height: number;
            is_silhouette: boolean;
            url: string;
            width: number;
        };
    };
}
