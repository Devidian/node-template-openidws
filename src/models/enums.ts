export enum wsCodes {
    AUTH,
    USER,
};

export enum userCodes {
    SELF,
    OTHER,
};

export enum AuthTypes {
    LOCAL,
    // OpenID connect provider
    GOOGLE,
    MICROSOFT,
    PAYPAL,
    SALESFORCE,
    YAHOO,
    PHANTAUTH,
    // OpenID provider (non-connect)
    FACEBOOK,
    STEAM
};
