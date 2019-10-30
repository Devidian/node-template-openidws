export interface GoogleOpenIdData {
    sub: string
    name?: string
    given_name?: string
    family_name?: string
    picture?: string
    email?: string
    email_verified?: boolean,
    locale?: string
    hd?: string
}

export interface MicrosoftOpenIdData {
    sub: string
    email?: string
    name?: string
    preferred_username?: string
}

export interface SteamOpenIdData {
    steamid: string,
    communityvisibilitystate?: number,
    profilestate?: number,
    personaname?: string,
    lastlogoff?: number,
    commentpermission?: number,
    profileurl?: string,
    avatar?: string,
    avatarmedium?: string,
    avatarfull?: string,
    personastate?: number,
    realname?: string,
    primaryclanid?: string,
    timecreated?: number,
    personastateflags?: number,
    loccountrycode?: string,
    locstatecode?: string,
    loccityid?: number,
}

export interface OpenIdData {
    google?: GoogleOpenIdData,
    microsoft?: MicrosoftOpenIdData,
    steam?: SteamOpenIdData
}
