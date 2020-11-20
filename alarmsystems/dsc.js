var alarms = require('./base.js');
var debug = require('debug');
var axios = require('axios');


class DSC extends alarms.AlarmBase {
    constructor (log, config) {
        super(log);
        this.key = config.key;
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;
        this.panicKey = config.panicKey;
        this.chimeKey = config.chimeKey;
        let rePlatformType = new RegExp('dsc','i');
        this.DSCAway = config.DSCAway;
        this.DSCStay = config.DSCStay;
        this.DSCReset = config.DSCReset;
        this.DSCExit = config.DSCExit;
        this.axiosHeaderConfig = {headers:{
            'Authorization':this.key,
            'Content-Type':'application/json',
            'Accept':'application/json'
        }};
    }

    async initZones() {
        try {
            this.log('dsc-initZones');
            var response = await axios.get(this.zoneURL,this.axiosHeaderConfig);
            if (response.status!=200 || !response.data)
                throw 'initZones failed or generated null data with response status of '+response.status;
            for (let zone in response.data['zones']) {
                zone = response.data['zones'][zone];
                this.alarmZones.push(new alarms.AlarmZone(zone.zone_id,zone.name,zone.description));
            }
            return true;
        }
        catch (e) {
            this.log(e);
            return false;
        }
    }

    async getAlarmState() {
        this.log('dsc-getAlarmState')
        try {
            var response = await axios.get(this.stateURL,this.axiosHeaderConfig);
            if ((response.status==200 || response.status==204) && response.data) {
                let stateObj = response.data;
                if(stateObj.last_message_received && (stateObj.last_message_received.includes('NIGHT') || stateObj.last_message_received.includes('INSTANT')))
                    stateObj.panel_armed_night = true; //map instant mode to night

                /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
                this.log(JSON.stringify(stateObj));
                if(stateObj.panel_alarming || stateObj.panel_panicked || stateObj.panel_fire_detected) {
                    this.state = 4;
                }
                else if(stateObj.panel_armed_night) {
                    this.state = 2;
                }
                else if(stateObj.panel_armed_stay) {
                    this.state = 0;
                }
                else if(stateObj.panel_armed) {
                    this.state = 1;
                }
                else
                    this.state = 3;

                // use state object to update zones
                for(let alarmZone in this.alarmZones) {
                    alarmZone=this.alarmZones[alarmZone];
                    if(stateObj.panel_zones_faulted.indexOf(alarmZone.zoneID)!=-1)
                        alarmZone.faulted = true;
                    else
                        alarmZone.faulted = false;

                }
                return true;
            }
            else 
                throw 'getAlarmState failed with response status of '+response.status;
        }
        catch (e) {
            this.log(e);
            return false;
        }
    }

    /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
    async setAlarmState(state) {
        this.log('DSC-setAlarmState')
        var codeToSend = null;
        switch (state) {
        case 0: //stay|home
            codeToSend = this.DSCStay;
            break;
        case 1 :
            codeToSend = this.DSCAway;
            break;
        case 2:
            codeToSend = this.setPIN+'7';
            break;
        case 3:
            codeToSend = this.setPIN+'1';
            break;
        case 4:
            codeToSend= this.panicKey;
            state=true;
            break;
        case 'chime':
            codeToSend= this.setPIN+this.chimeKey;
            state=true;
            break;
        }
        var tempObj = new Object();
        tempObj.keys=codeToSend;
        var body = JSON.stringify(tempObj);
        try {
            // ignore disarm requests if panel is already disarmed and it's a DSC panel (otherwise it rearms itself)
            if((state == 3) && (this.state == 3)) {
                debug('disarm request for DSC panel but system is already disarmed, ignoring');
                return true;
            }
            var response = await axios.post(this.setURL,body,this.axiosHeaderConfig);
            if(response.status==200 || response.status==204) //should be a 204
                return true;
            else
                throw 'setAlarmState failed with response status of '+response.status;
        }
        catch (err) {
            this.log(err);
            return false;
        }
    }
}

module.exports.DSC = DSC;