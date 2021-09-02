const config = require( './config' )
const twilio = require( 'twilio' )
const { xml } = require("@xmpp/component");

// Redis store of user keys data
function getUserState( redis, rawJid ) {
    const jid = rawJid.split('/')[ 0 ]
    const finalMap = {
        jid,
    }
    const keyNames = {
        botStatus:  jid + "::userBotStatusKey",
        accountSid: jid + "::userAccountSid",
        authToken: jid + "::userAuthToken",
        phoneNumber: jid + "::userPhoneNumber",
    }
    Object.keys( keyNames ).forEach( keyName => {
        const key = keyNames[ keyName ]
        finalMap[ keyName ] = {
            "key": key,
            "get": () => new Promise( resolve => { 
                redis.get( key, ( err, reply ) => {
                    if ( err ) throw err;
                    resolve( reply )
                })
            }),
            "set": ( value ) => new Promise( resolve => {
                redis.set( key, value, ( err, reply ) => {
                    if ( err ) throw err;
                    resolve( reply )
                })
            }),
            "del": () => new Promise( resolve => {
                redis.del( key, ( err, reply ) => {
                    if ( err ) throw err;
                    resolve( reply )
                })
            }),
        }
    })
    // eg: user.get( [ 'accountSid', 'authToken', 'phoneNumber' ] )
    finalMap.get = ( arr ) => Promise.all( 
        ( () => arr.map( keyName => finalMap[ keyName ].get() ) )()
    )

    // eg: user.set( [ 'accountSid', 'authToken' ], [ val1, val2 ] )
    finalMap.set = ( obj ) => Promise.all(
        ( () => Object.keys( obj ).map( keyName => {
                return finalMap[ keyName ].set( obj[ keyName ] )
            }) )()
    )

    // eg: user.clear( [ 'accountSid', 'authToken', 'phoneNumber' ] )
    finalMap.clear = ( arr ) => Promise.all(
        ( () => arr.map( keyName => finalMap[ keyName ].del() ) )()
    )
    return finalMap
}

function newMessage( text, to, from=config.COMPONENT_DOMAIN ) {
    const message = xml(
        "message",
        { type: "chat", from, to },
        xml("body", {}, text),
    );
    return message;
};

function testUserCredentials( user ) {
    return new Promise( async ( resolve ) => {
        Promise.all([ user.accountSid.get(), user.authToken.get(), user.phoneNumber.get() ])
            .then( ([ accountSid, authToken, phoneNumber ]) => {

                console.log( "verifying:", accountSid, authToken, phoneNumber )
                if ( ! /^AC/.test( accountSid ) ) {
                    resolve( new Error( "Account SID must start with AC" ) )
                    return
                }
                console.log( "asking twilio" )
                twilio( accountSid, authToken ).incomingPhoneNumbers
                    .list( { limit: 20, phoneNumber }, ( error, message ) => {
                        if ( error ) {
                            resolve( error )
                            return
                        }

                        const incomingPhoneNumbers = message
                        console.log( 'Twilio number:', incomingPhoneNumbers )

                        if ( incomingPhoneNumbers.length == 0 ) {
                            resolve( new Error( "Number not found" ) )
                            return
                        }
                        if ( incomingPhoneNumbers.length > 1 ) {
                            resolve( new Error( "Number not specific enough" ) )
                            return
                        }
                        if ( incomingPhoneNumbers[0].phoneNumber != phoneNumber ) {
                            resolve( new Error( "Number error" ) )
                            return
                        }
                        resolve( 0 )
                     })

            }).catch( err => {
                console.log("FAIL: credentials not ok, ", err.message)
                resolve( err )
            })
    })
}

module.exports = {
    getUserState,
    newMessage,
    testUserCredentials,
}
