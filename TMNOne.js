import crypto from 'crypto';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { URL } from 'url';

function safeJson(x) {
    try { return (typeof x === 'string') ? x : JSON.stringify(x); }
    catch { return String(x); }
}

function redact(s) {
    const t = String(s);
    return t
      .replace(/[A-Za-z0-9+/_-]{24,}/g, '[redacted]')
      .replace(/\d{9,}/g, '[redacted]')
      .slice(0,300);
}

class TMNOne {

    #tmnone_endpoint = 'https://api.tmn.one/api.php';
    #wallet_endpoint = 'https://api.tmn.one/proxy.dev.php/tmn-mobile-gateway/';
    #wallet_user_agent = 'tmnApp/truemoney tmnVersion/5.72.0 tmnBuild/1427 tmnPlatform/android';
    #wallet_version = '5.72.0';
    #tmnone_keyid = 0;
    #wallet_msisdn;
    #wallet_login_token;
    #wallet_tmn_id;
    #wallet_device_id;
    #wallet_access_token;
    #proxy_ip = '';
    #proxy_username = '';
    #proxy_password = '';
    #shield_id = '';
    #debugging = false;
    #sign256WarnAt = 0;
    #mockShieldOnceUsed = false;
    faceauth_webhook_url;
    faceauth_wait_timeout = 180;

    constructor() {}

    #normalizeKeyId(v) {
        let s = String(v ?? '').trim();
        s = s.replace(/^["']|["']$/g, '');
        if (/^0x/i.test(s)) s = 'x' + s.slice(2);
        return s;
    }

    #assertKeyIdFormat(k) {
        if (!/^x[a-zA-Z0-9]+$/.test(k)) {
            throw new Error('Invalid tmnone_keyid format (expected like x1234)');
        }
    }

    setData(tmnone_keyid, wallet_msisdn, wallet_login_token, wallet_tmn_id, wallet_device_id = '') {
        const kid = this.#normalizeKeyId(tmnone_keyid);
        this.#assertKeyIdFormat(kid);
        this.#tmnone_keyid = kid;
        this.#wallet_msisdn = wallet_msisdn;
        this.#wallet_login_token = wallet_login_token;
        this.#wallet_tmn_id = wallet_tmn_id;
        this.#wallet_device_id = wallet_device_id;
    }

    setProxy(proxy_ip, proxy_username, proxy_password) {
        this.#proxy_ip = proxy_ip;
        this.#proxy_username = proxy_username;
        this.#proxy_password = proxy_password;
    }

    setDataWithAccessToken(tmnone_keyid, wallet_access_token, wallet_login_token, wallet_device_id) {
        const kid = this.#normalizeKeyId(tmnone_keyid);
        this.#assertKeyIdFormat(kid);
        this.#tmnone_keyid = kid;
        this.#wallet_access_token = wallet_access_token;
        this.#wallet_login_token = wallet_login_token;
        this.#wallet_device_id = wallet_device_id;
    }

    enableDebugging() {
        this.#debugging = true;
    }

    #assertCoreCfg() {
        const kid = this.#normalizeKeyId(this.#tmnone_keyid);
        this.#assertKeyIdFormat(kid);
        const missing = [];
        if (!String(kid || '').trim()) missing.push('keyid');
        if (!String(this.#wallet_login_token || '').trim()) missing.push('loginToken');
        if (!String(this.#wallet_tmn_id || '').trim()) missing.push('tmnId');
        if (!String(this.#wallet_device_id || '').trim()) missing.push('deviceId');
        if (!String(this.#wallet_msisdn || '').trim()) missing.push('msisdn');
        if (missing.length) {
            const err = new Error('tmn_cfg_missing');
            err.code = 'tmn_cfg_missing';
            err.missing_fields = missing;
            throw err;
        }
    }

    async loginWithPin6(wallet_pin) {
        try {
            this.#safeLog('[TMNOne] key_exchange cfg', {
                keyid: { set: !!String(this.#tmnone_keyid || '').trim(), len: String(this.#tmnone_keyid || '').trim().length, mask: this.#maskSensitiveValue(this.#tmnone_keyid) },
                tmnId: { set: !!String(this.#wallet_tmn_id || '').trim(), len: String(this.#wallet_tmn_id || '').trim().length, mask: this.#maskSensitiveValue(this.#wallet_tmn_id) },
                deviceId: { set: !!String(this.#wallet_device_id || '').trim(), len: String(this.#wallet_device_id || '').trim().length, mask: this.#maskSensitiveValue(this.#wallet_device_id) },
                msisdn: { set: !!String(this.#wallet_msisdn || '').trim(), len: String(this.#wallet_msisdn || '').trim().length, mask: this.#maskSensitiveValue(this.#wallet_msisdn) },
            });
            this.#assertCoreCfg();
            await this.#getCachedAccessToken();
            if (this.#wallet_access_token) {
                return this.#wallet_access_token;
            }
            if (!this.#shield_id) {
                this.#shield_id = await this.#getShieldID();
            }
            const uri = 'mobile-auth-service/v3/pin/login';
            const hashed_pin = crypto.createHash('sha256').update(this.#wallet_tmn_id + wallet_pin).digest('hex');
            const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_login_token}|${this.#wallet_version}|${this.#wallet_device_id}|${hashed_pin}`);
            if (!signature) {
                throw new Error('signature empty');
            }
            
            const postdata = {
                device_id: this.#wallet_device_id,
                pin: hashed_pin,
                app_version: this.#wallet_version
            };
            
            const headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_login_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];

            let wallet_response_body = await this.#wallet_connect(uri, headers, JSON.stringify(postdata));

            if (wallet_response_body.code && wallet_response_body.code.endsWith('-428') && wallet_response_body.data?.method === 'face') {
                const csid = wallet_response_body.data.csid;
                wallet_response_body = await this.#verifyFaceLogin(csid);
            }

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }
            
            if (wallet_response_body.data?.access_token) {
                this.#wallet_access_token = wallet_response_body.data.access_token;
                const aes_key = crypto.createHash('sha512').update(this.#wallet_tmn_id).digest().slice(0, 32);
                const aes_iv = crypto.randomBytes(16);
                
                const cipher = crypto.createCipheriv('aes-256-cbc', aes_key, aes_iv);
                const encrypted_raw = Buffer.concat([
                    cipher.update(this.#wallet_access_token, 'utf8'),
                    cipher.final()
                ]);
                
                const encrypted_access_token = aes_iv.toString('hex') + encrypted_raw.toString('base64');
                const data = { access_token: encrypted_access_token, shield_id: this.#shield_id };
                const request_body = JSON.stringify({
                    scope: 'text_storage_obj',
                    cmd: 'set',
                    data: JSON.stringify(data)
                });
                
                await this.#tmnone_connect(request_body);
                await this.#uploadMetaData();
            }
        } catch (e) {
            if (e?.response?.status === 400) {
                const b = e?.response?.data || {};
                this.#safeWarn('[TMNOne] key_exchange http400', {
                    message: this.#mask(b?.message || ''),
                    error: this.#mask(b?.error || '')
                });
            }
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
            return { error: e.message };
        }
        return this.#wallet_access_token;
    }

	/*
	ดึงข้อมูลค่าธรรมเนียม และจำนวนรายการที่เข้าเงื่อนไขถูกเก็บค่าธรรมเนียม
	channel = [ refill , p2p , promptpay-in , promptpay-out , datasender_api (สำหรับดึง URL จัดการ API/Webhook) ]
	*/
    async getWalletFee(channel) {
        const request_body = JSON.stringify({
            scope: 'extra',
            cmd: 'get_wallet_fees',
            data: {
                login_token: this.#wallet_login_token,
                device_id: this.#wallet_device_id,
                access_token: this.#wallet_access_token,
                fee_channel: channel
            }
        });
        const result = await this.#tmnone_connect(request_body);
        return result.result || null;
    }

	/*
	ดึง Amity Token (สำหรับใช้งาน Chat บน https://www.tmn.one/amity.html)
	*/
    async getAmityToken() {
        const uri = 'social-composite/v1/authentications/amity-token/';
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '-');
    }

	/*
	ดึงยอดเงินคงเหลือ
	*/
    async getBalance() {
        const uri = 'user-profile-composite/v1/users/balance/';
        if (!this.#shield_id) {
            this.#shield_id = await this.#getShieldID();
        }
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '');
    }

	/*
	ดึงรายการ Transaction
	start_date = วันที่เริ่มต้น (inclusive)
	end_date = วันที่สิ้นสุด (exclusive)
	limit = จำนวนรายการสูงสุดต่อหน้า (ไม่เกิน 50 รายการ)
	page = หน้า
	*/
    async fetchTransactionHistory(start_date, end_date, limit = 10, page = 1) {
        const uri = `history-composite/v1/users/transactions/history/?start_date=${start_date}&end_date=${end_date}&limit=${limit}&page=${page}&type=&action=`;
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '');
    }

	/*
	ดึงรายละเอียด Transaction
	report_id = report_id ที่ได้มาจากขั้นตอน fetchTransactionHistory
	*/
    async fetchTransactionInfo(report_id) {
        const cache_filename = path.join(os.tmpdir(), `tmn-${report_id}`);
        const aes_key = crypto.createHash('sha512').update(this.#wallet_tmn_id).digest().slice(0, 32);

        try {
            const cached_data_buf = await fs.readFile(cache_filename);
            const iv_hex = cached_data_buf.slice(0, 32).toString('utf8');
            const aes_iv = Buffer.from(iv_hex, 'hex');
            const encrypted_part = cached_data_buf.slice(32);

            const decipher = crypto.createDecipheriv('aes-256-cbc', aes_key, aes_iv);
            const decrypted_raw = Buffer.concat([decipher.update(encrypted_part), decipher.final()]);
            
            let wallet_response_body = JSON.parse(decrypted_raw.toString('utf8'));
            wallet_response_body.cached = true;
            return wallet_response_body;

        } catch (e) {
            // Cache miss or read error
        }

        const uri = `history-composite/v1/users/transactions/history/detail/${report_id}?version=1`;
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        
        const wallet_response_body = await this.#wallet_connect(uri, headers, '');

        if (wallet_response_body.data) {
            try {
                const aes_iv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', aes_key, aes_iv);
                
                const data_to_encrypt = JSON.stringify(wallet_response_body.data);
                const encrypted_raw = Buffer.concat([
                    cipher.update(data_to_encrypt, 'utf8'),
                    cipher.final()
                ]);
                
                const iv_hex = aes_iv.toString('hex');
                const data_to_write = Buffer.concat([Buffer.from(iv_hex, 'utf8'), encrypted_raw]);
                
                await fs.writeFile(cache_filename, data_to_write);
            } catch (e) {
                this.#safeWarn(`Failed to write cache file ${cache_filename}: ${e.message}`);
            }
        }
        return wallet_response_body;
    }

	/*
	ตรวจสอบ QR Code บนสลิปโอนเงิน
	qr_data = ข้อมูล raw data ใน QR Code บนสลิป
	*/
    async fetchQRDetail(qr_data) {
        const uri = `history-composite/v1/users/transactions/history/qr-detail/${qr_data}`;
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '');
    }

	/*
	ดูประวัติการส่งซองอั่งเปา
	*/
    async fetchVoucherHistory() {
        const uri = 'transfer-composite/v1/vouchers/?limit=20&page=0';
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '');
    }

	/*
	สั่งซองอั่งเปา
	amount = จำนวนเงิน
	detail = รายละเอียดซอง
	*/
    async generateVoucher(amount, detail = '') {
        try {
            const uri = 'transfer-composite/v1/vouchers/';
            const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|F|${amount}|1|${detail}`);
            
            const post_body = JSON.stringify({
                amount: amount.toString(),
                detail: detail,
                duration: 24,
                isnotify: true,
                tmn_id: this.#wallet_tmn_id,
                mobile: this.#wallet_msisdn,
                voucher_type: "F",
                member: "1"
            });
            
            const headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];

            let wallet_response_body = await this.#wallet_connect(uri, headers, post_body);

            if (wallet_response_body.code && wallet_response_body.code.endsWith('-428') && wallet_response_body.data?.method === 'face') {
                const csid = wallet_response_body.data.csid;
                wallet_response_body = await this.#verifyFace(csid);
            }

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }
            return wallet_response_body;
        } catch (e) {
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
            return { error: e.message };
        }
    }

	/*
	ดึงข้อมูลเบอร์ Wallet
	payee_wallet_id = เบอร์ Wallet ที่ต้องการตรวจสอบ
	*/
    async getRecipientInfo(payee_wallet_id) {
        const uri = `user-profile-composite/v1/users/public-profile/${payee_wallet_id}`;
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '');
    }

	/*
	โอนเงิน P2P
	payee_wallet_id = เบอร์ Wallet ปลายทาง
	amount = จำนวนเงิน
	personal_msg = ข้อความ
	*/
    async transferP2P(payee_wallet_id, amount, personal_msg = '') {
        let draft_transaction_id = '';
        try {
            const amount_str = parseFloat(amount).toFixed(2);
            
            let uri = 'transfer-composite/v2/p2p-transfer/draft-transactions';
            let signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|${amount_str}|${payee_wallet_id}`);
            
            let headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];
            
            let post_body = JSON.stringify({
                receiverId: payee_wallet_id,
                message: personal_msg,
                amount: amount_str
            });

            let wallet_response_body = await this.#wallet_connect(uri, headers, post_body);

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }
            
            draft_transaction_id = wallet_response_body.data.draft_transaction_id;
            const reference_key = wallet_response_body.data.reference_key;

            uri = `transfer-composite/v2/p2p-transfer/transactions/${draft_transaction_id}`;
            signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|${reference_key}`);
            
            headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];

            post_body = JSON.stringify({
                reference_key: reference_key
            });

            wallet_response_body = await this.#wallet_connect(uri, headers, post_body);

            if (wallet_response_body.code && wallet_response_body.code.endsWith('-428') && wallet_response_body.data?.method === 'face') {
                const csid = wallet_response_body.data.csid;
                wallet_response_body = await this.#verifyFace(csid);
            }

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }

            wallet_response_body.draft_transaction_id = draft_transaction_id;
            return wallet_response_body;

        } catch (e) {
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
            return { error: e.message };
        }
    }

	/*
	ดึงสถานะการโอนเงิน P2P
	draft_transaction_id = draft_transaction_id จากขั้นตอน transferP2P
	*/
    async getTransferP2PStatus(draft_transaction_id) {
        const uri = `transfer-composite/v2/p2p-transfer/transactions/${draft_transaction_id}/status`;
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}`);
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        return await this.#wallet_connect(uri, headers, '');
    }

	/*
	โอนเงินพร้อมเพย์
	payee_proxy_value = หมายเลขพร้อมเพย์ (เบอร์โทร/บัตรประชาชน)
	amount = จำนวนเงิน
	*/
    async transferQRPromptpay(payee_proxy_value, amount) {
        try {
            const amount_str = parseFloat(amount).toFixed(2);
            
            let uri = 'transfer-composite/v1/promptpay/inquiries';
            let signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|${amount_str}|${payee_proxy_value}|QR`);
            
            let headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];

            let post_body = JSON.stringify({
                amount: amount_str,
                input_method: "QR",
                to_proxy_value: payee_proxy_value
            });

            let wallet_response_body = await this.#wallet_connect(uri, headers, post_body);

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }
            
            const draft_transaction_id = wallet_response_body.data.draft_transaction_id;

            uri = 'transfer-composite/v1/promptpay/transfers';
            signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|${draft_transaction_id}`);
            
            headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];

            post_body = JSON.stringify({
                ref_number: draft_transaction_id
            });
            
            wallet_response_body = await this.#wallet_connect(uri, headers, post_body);

            if (wallet_response_body.code && wallet_response_body.code.endsWith('-428') && wallet_response_body.data?.method === 'face') {
                const csid = wallet_response_body.data.csid;
                wallet_response_body = await this.#verifyFace(csid);
            }

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }
            
            return wallet_response_body;

        } catch (e) {
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
            return { error: e.message };
        }
    }

	/*
	โอนเงินเข้าบัญชีธนาคาร
	bank_code = SCB,BBL,BAY,KBANK,KTB,TTB,CIMB,LHBANK,UOB,KKP,GSB,BAAC,GHB,ISBT,TISCO,TCRB
	amount = จำนวนเงิน
	wallet_pin = PIN 6 หลักของ Wallet
	*/
    async transferBankAC(bank_code, bank_ac, amount, wallet_pin) {
        try {
            const amount_str = parseFloat(amount).toFixed(2);
            
            let signature = await this.calculate_sign256(`${amount_str}|${bank_code}|${bank_ac}`);
            let headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];
            
            let post_body = JSON.stringify({
                bank_name: bank_code,
                bank_account: bank_ac,
                amount: amount_str
            });

            let wallet_response_body = await this.#wallet_connect('fund-composite/v1/withdrawal/draft-transaction', headers, post_body);

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }
            
            const draft_transaction_id = wallet_response_body.data.draft_transaction_id;

            const uri = 'fund-composite/v3/withdrawal/transaction';
            signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|${draft_transaction_id}`);
            
            headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`
            ];
            
            post_body = JSON.stringify({
                draft_transaction_id: draft_transaction_id
            });

            wallet_response_body = await this.#wallet_connect(uri, headers, post_body);

            if (wallet_response_body.code && wallet_response_body.code.endsWith('-428') && wallet_response_body.data?.method === 'pin') {
                const csid = wallet_response_body.data.csid;
                const hashed_pin = crypto.createHash('sha256').update(this.#wallet_tmn_id + wallet_pin).digest('hex');
                
                signature = await this.calculate_sign256(`${this.#wallet_access_token}|${csid}|${hashed_pin}|manual_input`);
                
                headers = [
                    'Content-Type: application/json',
                    `Authorization: ${this.#wallet_access_token}`,
                    `signature: ${signature}`,
                    `X-Device: ${this.#wallet_device_id}`,
                    'X-Geo-Location: city=; country=; country_code=',
                    'X-Geo-Position: lat=; lng=',
                    `X-Shield-Session-Id: ${this.#shield_id}`,
                    `CSID: ${csid}`
                ];
                
                post_body = JSON.stringify({
                    pin: hashed_pin,
                    method: "manual_input"
                });

                wallet_response_body = await this.#wallet_connect('mobile-auth-service/v1/authentications/pin', headers, post_body);
            }

            if (wallet_response_body.code && wallet_response_body.code.endsWith('-428') && wallet_response_body.data?.method === 'face') {
                const csid = wallet_response_body.data.csid;
                wallet_response_body = await this.#verifyFace(csid);
            }

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }

            return wallet_response_body;

        } catch (e) {
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]} (${e.lineNumber})`);
            return { error: `${e.message} (line:${e.lineNumber})` };
        }
    }

	/*
	สร้าง QR จ่ายเงิน (7-11 , ร้านค้าต่างๆ)
	ได้รับ data->payment_code เพื่อสร้าง QR Code สำหรับจ่ายเงิน
	*/
    async getPaymentCode() {
        const uri = 'payment-composite/v2/payment-codes/';
        const timestamp = Date.now();
        const signature = await this.calculate_sign256(`${this.#wallet_tmn_id}|BALANCE`);
        
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];
        
        const post_body = JSON.stringify({
            asset_id: this.#wallet_tmn_id,
            asset_type: "BALANCE",
            signature: signature
        });
        
        return await this.#wallet_connect(uri, headers, post_body);
    }

    async #getCachedAccessToken() {
        const request_body = JSON.stringify({ scope: 'text_storage_obj', cmd: 'get' });
        const response = await this.#tmnone_connect(request_body);
        
        let data = {};
        try {
            if (response.data) {
                data = JSON.parse(response.data);
            }
        } catch (e) {
             // Ignore parsing error
        }

        const encrypted_access_token = data.access_token || '';
        this.#shield_id = data.shield_id || '';

        if (encrypted_access_token) {
            try {
                const aes_key = crypto.createHash('sha512').update(this.#wallet_tmn_id).digest().slice(0, 32);
                const aes_iv = Buffer.from(encrypted_access_token.substring(0, 32), 'hex');
                const encrypted_part = encrypted_access_token.substring(32);
                
                const decipher = crypto.createDecipheriv('aes-256-cbc', aes_key, aes_iv);
                const decrypted_raw = Buffer.concat([
                    decipher.update(Buffer.from(encrypted_part, 'base64')),
                    decipher.final()
                ]);
                
                const access_token = decrypted_raw.toString('utf8');
                if (access_token) {
                    this.#wallet_access_token = access_token;
                }
            } catch (e) {
                this.#safeLog(`Failed to decrypt cached token: ${e.message}`);
            }
        }
    }

    async #getShieldID() {
        if (String(process.env.TMN_SHIELD_EXPIRED_MOCK || '') === '1') {
            return 'mock-shield-id';
        }
        const request_body = JSON.stringify({
            scope: 'extra',
            cmd: 'get_shield_id',
            data: { device_id: this.#wallet_device_id }
        });
        const response = await this.#tmnone_connect(request_body);
        return response.shield_id || '';
    }

    async #verifyFaceLogin(csid) {
        try {
            const uri = 'mobile-auth-service/v2/login-token-authentications/face';
            const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_login_token}|${csid}`);
            
            const headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_login_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`,
                `CSID: ${csid}`,
                'os-version: 15',
                `tmn-app-version: ${this.#wallet_version}`,
                'verify-token: android',
                'channel: android'
            ];

            let wallet_response_body = await this.#wallet_connect(uri, headers, '-');

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }

            const session_id = wallet_response_body.data.session_id;

            let request_body = JSON.stringify({
                scope: 'extra',
                cmd: 'face_verify_v2',
                data: { session_id: session_id }
            });
            await this.#tmnone_connect(request_body);

            if (this.faceauth_webhook_url) {
                this.#print_debugging('tmnone_connect', `faceauth_webhook_url = ${this.faceauth_webhook_url}`);
                try {
                    const webhook_response = await axios.post(this.faceauth_webhook_url, 
                        JSON.stringify({ wallet_msisdn: this.#wallet_msisdn }), 
                        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
                    );
                    this.#print_debugging('tmnone_connect', `faceauth_webhook_response = ${webhook_response.data}`);
                } catch (webhook_e) {
                    this.#print_debugging('tmnone_connect', `faceauth_webhook_response error: ${webhook_e.message}`);
                }
            }

            let face_verify_successful = false;
            this.#print_debugging('tmnone_connect', `faceauth_wait_timeout = ${this.faceauth_wait_timeout}`);
            
            for (let i = 0; i < this.faceauth_wait_timeout; i++) {
                const verification_result = await this.#tmnone_connect(request_body);
                if (verification_result.data?.status === 1) {
                    face_verify_successful = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (!face_verify_successful) {
                throw new Error('Liveness Check Timeout');
            }

            const status_uri = `mobile-auth-service/v2/login-token-authentications/face/${session_id}/status`;
            const status_signature = await this.calculate_sign256(`/tmn-mobile-gateway/${status_uri}|${this.#wallet_login_token}|${csid}`);
            const status_headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_login_token}`,
                `signature: ${status_signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`,
                `CSID: ${csid}`
            ];
            
            wallet_response_body = await this.#wallet_connect(status_uri, status_headers, '');
            return wallet_response_body;

        } catch (e) {
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
            return { error: e.message };
        }
    }

    async #verifyFace(csid) {
        try {
            const uri = 'mobile-auth-service/v2/authentications/face';
            const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|${csid}`);
            
            const headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`,
                `CSID: ${csid}`,
                'os-version: 15',
                `tmn-app-version: ${this.#wallet_version}`,
                'verify-token: android',
                'channel: android'
            ];

            let wallet_response_body = await this.#wallet_connect(uri, headers, '-');

            if (!wallet_response_body.code || !wallet_response_body.code.endsWith('-200')) {
                throw new Error(this.#fmtWalletErr(wallet_response_body));
            }

            const session_id = wallet_response_body.data.session_id;

            let request_body = JSON.stringify({
                scope: 'extra',
                cmd: 'face_verify_v2',
                data: { session_id: session_id }
            });
            await this.#tmnone_connect(request_body);

            if (this.faceauth_webhook_url) {
                this.#print_debugging('tmnone_connect', `faceauth_webhook_url = ${this.faceauth_webhook_url}`);
                try {
                    const webhook_response = await axios.post(this.faceauth_webhook_url, 
                        JSON.stringify({ wallet_msisdn: this.#wallet_msisdn }), 
                        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
                    );
                    this.#print_debugging('tmnone_connect', `faceauth_webhook_response = ${webhook_response.data}`);
                } catch (webhook_e) {
                    this.#print_debugging('tmnone_connect', `faceauth_webhook_response error: ${webhook_e.message}`);
                }
            }

            let face_verify_successful = false;
            this.#print_debugging('tmnone_connect', `faceauth_wait_timeout = ${this.faceauth_wait_timeout}`);
            
            for (let i = 0; i < this.faceauth_wait_timeout; i++) {
                const verification_result = await this.#tmnone_connect(request_body);
                if (verification_result.data?.status === 1) {
                    face_verify_successful = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (!face_verify_successful) {
                throw new Error('Liveness Check Timeout');
            }

            const status_uri = `mobile-auth-service/v2/authentications/face/${session_id}/status`;
            const status_signature = await this.calculate_sign256(`/tmn-mobile-gateway/${status_uri}|${this.#wallet_access_token}|${csid}`);
            const status_headers = [
                'Content-Type: application/json',
                `Authorization: ${this.#wallet_access_token}`,
                `signature: ${status_signature}`,
                `X-Device: ${this.#wallet_device_id}`,
                'X-Geo-Location: city=; country=; country_code=',
                'X-Geo-Position: lat=; lng=',
                `X-Shield-Session-Id: ${this.#shield_id}`,
                `CSID: ${csid}`
            ];
            
            wallet_response_body = await this.#wallet_connect(status_uri, status_headers, '');
            return wallet_response_body;

        } catch (e) {
            this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
            return { error: e.message };
        }
    }

    async #uploadMetaData() {
        const now = new Date();
        const pad = (num) => num.toString().padStart(2, '0');
        const date_time = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        const crc_val = zlib.crc32(this.#wallet_device_id);
        const disk_diff = crc_val % 1073741824;
		const diskspace_total = 118489088000 - disk_diff;
		const diskspace_used = 21474836480 + disk_diff;
		const diskspace_free = diskspace_total - diskspace_used;
		const app_first_installation = 1704067200000 + (crc_val % 31536000);

        const uri = 'device-composite/v1/users/device-metadata';
        const signature = await this.calculate_sign256(`/tmn-mobile-gateway/${uri}|${this.#wallet_access_token}|TrueMoney|100|${date_time}|11855978496|false|15`);
        
        const headers = [
            'Content-Type: application/json',
            `Authorization: ${this.#wallet_access_token}`,
            `signature: ${signature}`,
            `X-Device: ${this.#wallet_device_id}`,
            'X-Geo-Location: city=; country=; country_code=',
            'X-Geo-Position: lat=; lng=',
            `X-Shield-Session-Id: ${this.#shield_id}`
        ];

        const post_body = {
            app_first_installation: app_first_installation,
            app_name: "TrueMoney",
            app_package_name: "th.co.truemoney.wallet",
            app_version: this.#wallet_version,
            battery_level: 100,
            binding_devices_count: 0,
            build_product: "e2sxeea",
            cell_connected: false,
            connected_ssid: "<unknown ssid>",
            contact_count: 0,
            contact_list: [],
            cpu_num: 0,
            data_epoch_time: date_time,
            device_model: "SM-S926B",
            device_os: "android",
            device_type: "",
            diskspace_free: diskspace_free,
            diskspace_total: diskspace_total,
            diskspace_used: diskspace_used,
            gps_coord: { latitude: "", longitude: "" },
            installed_apps: [],
            installed_package_names: [],
            internet_type: "",
            mobile_dbm: "",
            network_type: "WIFI",
            os_version: "15",
            photo_count: 0,
            ramsize_total: 11855978496,
            resolution: { display: "1467", width: "720" },
            running_package_names: [],
            sim_carrier: "",
            sim_state: "SIM_STATE_ABSENT",
            sms_count: 0,
            timezone: "Asia/Bangkok",
            vpn_connected: false,
            wifi_connected: true
        };

        const wallet_response_body = await this.#wallet_connect(uri, headers, JSON.stringify(post_body));
        return wallet_response_body.code ? wallet_response_body : {};
    }

    #maskSensitiveValue(val) {
        if (val === undefined || val === null) return '';
        const str = String(val);
        if (!str) return '';
        if (str.length <= 6) return '*'.repeat(str.length);
        return `${str.slice(0, 3)}***${str.slice(-3)}`;
    }

    #redactSensitiveText(text) {
        let out = String(text);
        const kid = this.#normalizeKeyId(this.#tmnone_keyid);
        const items = [
            kid,
            this.#wallet_login_token,
            this.#wallet_tmn_id,
            this.#wallet_device_id,
            this.#wallet_msisdn,
            process.env.TMN_PIN6
        ];
        for (const it of items) {
            if (!it) continue;
            const raw = String(it);
            out = out.split(raw).join(this.#maskSensitiveValue(raw));
        }
        return out;
    }

    #mask(val) {
        if (val === null || val === undefined) return val;
        if (typeof val === 'string') {
            const str = String(val);
            if (!str) return '';
            if (str.length <= 8) return str;
            return `${str.slice(0, 3)}***${str.slice(-3)}`;
        }
        if (typeof val === 'number' || typeof val === 'boolean') return val;
        if (Array.isArray(val)) return val.map((v) => this.#mask(v));
        if (val instanceof Error) {
            return { message: this.#mask(val.message) };
        }
        if (typeof val === 'object') {
            const sensitiveKeys = new Set([
                'access_token',
                'thai_id',
                'date_of_birth',
                'full_name',
                'first_name_th',
                'last_name_th',
                'mobile_number',
                'address_list',
                'email'
            ]);
            const out = {};
            for (const [k, v] of Object.entries(val)) {
                if (sensitiveKeys.has(String(k).toLowerCase())) {
                    out[k] = '[redacted]';
                } else {
                    out[k] = this.#mask(v);
                }
            }
            return out;
        }
        return val;
    }

    #fmtWalletErr(body) {
        if (!body) return 'ERR - unknown_error';
        if (body instanceof Error) {
            const msg = String(body.message || 'unknown_error');
            return `ERR - ${msg}`;
        }
        if (typeof body === 'string') {
            const msg = body || 'unknown_error';
            return `ERR - ${msg}`;
        }
        const msg =
            body?.message ||
            body?.error ||
            body?.result?.error ||
            body?.result?.message ||
            body?.result?.data?.message ||
            body?.data?.message ||
            'unknown_error';
        let code = body?.code;
        if (code === undefined || code === null) {
            code = 'ERR';
        } else {
            const s = String(code).trim().toLowerCase();
            if (!s || s === 'undefined' || s === 'null') {
                code = 'ERR';
            }
        }
        return `${code} - ${msg}`;
    }

    #isShieldExpired(errOrBody) {
        const msg = this.#fmtWalletErr(errOrBody);
        let s = '';
        try {
            const payload = errOrBody?.payload ?? errOrBody?.data ?? errOrBody;
            s = (typeof payload === 'string') ? payload : JSON.stringify(payload || {});
        } catch {
            s = '';
        }
        const hint = `${msg || ''} ${errOrBody?.message || ''} ${s}`;
        return /shield[_\s-]*id\s*(?:is\s*)?expired|shield[_\s-]*id[^a-z0-9]*expired|shield[^a-z0-9]*expired|shield[_\s-]*session\s*(?:is\s*)?expired|shield[_\s-]*session[^a-z0-9]*expired/i.test(hint);
    }

    #patchShieldHeader(headers_array) {
        let hasShieldHeader = false;
        const headers2 = (headers_array || []).map(h => {
            if (/^X-Shield-Session-Id\s*:/i.test(h)) {
                hasShieldHeader = true;
                return `X-Shield-Session-Id: ${this.#shield_id}`;
            }
            return h;
        });
        if (!hasShieldHeader) {
            headers2.push(`X-Shield-Session-Id: ${this.#shield_id}`);
        }
        return headers2;
    }

    #redactSensitiveAny(val) {
        if (val === null || val === undefined) return val;
        if (typeof val === 'string') return this.#redactSensitiveText(val);
        if (typeof val === 'number' || typeof val === 'boolean') return val;
        if (Array.isArray(val)) return val.map((v) => this.#redactSensitiveAny(v));
        if (val instanceof Error) {
            const out = new Error(this.#redactSensitiveText(val.message));
            if (val.stack) out.stack = this.#redactSensitiveText(val.stack);
            for (const key of Object.keys(val)) {
                out[key] = this.#redactSensitiveAny(val[key]);
            }
            return out;
        }
        if (typeof val === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(val)) {
                out[k] = this.#redactSensitiveAny(v);
            }
            return out;
        }
        return val;
    }

    safeJson(x) {
        if (typeof x === 'string') return x;
        try {
            return JSON.stringify(x);
        } catch (e) {
            return String(x);
        }
    }

    redact(s) {
        const snip = String(s ?? '').slice(0, 300);
        return snip.replace(/[A-Za-z0-9+/_-]{24,}/g, '[redacted]');
    }

    #safeLog(...args) {
        console.log(...args.map((a) => this.#redactSensitiveAny(a)));
    }

    #safeWarn(...args) {
        console.warn(...args.map((a) => this.#redactSensitiveAny(a)));
    }

    #print_debugging(tag, message) {
        if (this.#debugging) {
            this.#safeLog(`${tag}\t${message}`);
        }
    }

    async #tmnone_connect(request_body_json) {
        let response_body;
        let target_url = this.#tmnone_endpoint;
        let used_proxy_calc;
        this.#print_debugging('tmnone_connect', `request_len=${String(request_body_json || '').length}`);
        const shape = (v) => {
            const s = String(v ?? '').trim();
            return { set: s !== '', len: s.length };
        };
        this.#safeLog('[tmnone_connect] cfg_shape', {
            keyid: shape(this.#tmnone_keyid),
            tmnId: shape(this.#wallet_tmn_id),
            deviceId: shape(this.#wallet_device_id),
            msisdn: shape(this.#wallet_msisdn),
        });

        const aes_key = crypto.createHash('sha512').update(this.#wallet_login_token).digest().slice(0, 32);
        const aes_iv = crypto.randomBytes(16);

        try {
            const cipher = crypto.createCipheriv('aes-256-cbc', aes_key, aes_iv);
            const encrypted_raw = Buffer.concat([
                cipher.update(request_body_json, 'utf8'),
                cipher.final()
            ]);
            
            const encrypted_payload = aes_iv.toString('hex') + encrypted_raw.toString('base64');
            const postData = JSON.stringify({ encrypted: encrypted_payload });

            const kid = this.#normalizeKeyId(this.#tmnone_keyid);
            this.#assertKeyIdFormat(kid);
            const headers = {
                'X-KeyID': kid,
                'Content-Type': 'application/json',
                'User-Agent': `okhttp/4.4.0/202601302100/${kid}`
            };

            const maskLogValue = (val) => {
                if (val === undefined || val === null) return '';
                const str = String(val);
                if (!str) return '';
                if (str.length <= 6) return '*'.repeat(str.length);
                return `${str.slice(0, 3)}***${str.slice(-3)}`;
            };
            const safeProxyForLog = (proxyVal) => {
                if (proxyVal === false) return false;
                if (!proxyVal) return undefined;
                if (typeof proxyVal === 'string') return maskLogValue(proxyVal);
                const safe = { ...proxyVal };
                if (safe.auth) {
                    safe.auth = {
                        username: maskLogValue(safe.auth.username),
                        password: maskLogValue(safe.auth.password)
                    };
                }
                return safe;
            };

            const proxyIpEnv = (process.env.PROXY_IP || '').trim();
            const axiosConfig = { headers: headers, timeout: 60000 };
            if (!proxyIpEnv) {
                axiosConfig.proxy = false;
            } else {
                const proxyUrl = new URL(proxyIpEnv.startsWith('http') ? proxyIpEnv : `http://${proxyIpEnv}`);
                axiosConfig.proxy = {
                    protocol: proxyUrl.protocol.replace(':', ''),
                    host: proxyUrl.hostname,
                    port: parseInt(proxyUrl.port, 10),
                };
                if (proxyUrl.username || proxyUrl.password) {
                    axiosConfig.proxy.auth = {
                        username: proxyUrl.username,
                        password: proxyUrl.password
                    };
                }
            }
            used_proxy_calc = axiosConfig.proxy;

            this.#safeLog('tmnone_connect target_url:', target_url);
            this.#safeLog('tmnone_connect env_proxy:', {
                HTTP_PROXY: maskLogValue(process.env.HTTP_PROXY),
                HTTPS_PROXY: maskLogValue(process.env.HTTPS_PROXY),
                ALL_PROXY: maskLogValue(process.env.ALL_PROXY),
                NO_PROXY: maskLogValue(process.env.NO_PROXY),
                PROXY_IP: maskLogValue(process.env.PROXY_IP)
            });
            this.#safeLog('tmnone_connect axios_proxy:', safeProxyForLog(axiosConfig.proxy));

            const resp = await axios.post(target_url, postData, axiosConfig);

            if (resp.headers['x-wallet-user-agent']) {
                this.#wallet_user_agent = resp.headers['x-wallet-user-agent'];
            }
            if (resp.headers['x-wallet-app-version']) {
                this.#wallet_version = resp.headers['x-wallet-app-version'];
            }

            response_body = resp.data;
            const js = this.#redactSensitiveText(redact(safeJson(resp.data))).slice(0, 180);
            this.#safeLog('[tmnone_connect] response', {
                status: resp.status,
                keys: Object.keys(resp.data || {}),
                resp_snip: js
            });

            if (response_body && response_body.encrypted) {
                const decipher = crypto.createDecipheriv('aes-256-cbc', aes_key, aes_iv);
                const decrypted_raw = Buffer.concat([
                    decipher.update(Buffer.from(response_body.encrypted, 'base64')),
                    decipher.final()
                ]);
                response_body = JSON.parse(decrypted_raw.toString('utf8'));
            }
            const isSignReq = String(request_body_json || '').includes('"calculate_sign256"');
            if (isSignReq && (!resp?.data?.encrypted || !response_body?.signature)) {
                this.#safeWarn('[tmnone_connect] no_signature', {
                    status: resp.status,
                    resp_snip: js
                });
            }

            const summary = {
                code: this.#mask(response_body?.code),
                success: this.#mask(response_body?.success),
                message: this.#mask(response_body?.message)
            };
            this.#print_debugging('tmnone_connect', `response_summary = ${JSON.stringify(summary)}`);

        } catch (e) {
            const line = e?.stack ? e.stack.split('\n')[1] : '';
            if (e?.response) {
                const status = e.response.status;
                let data_snip = '';
                try {
                    data_snip = String(e.response.data ?? '').slice(0, 300);
                } catch {}
                data_snip = this.#redactSensitiveText(data_snip);
                this.#safeWarn('[tmnone_connect] HTTP error', { status, data_snip });
                this.#safeLog(`Error: ${e.message} on line ${line}`);
                return { error: e.message, status, data_snip };
            }
            this.#safeLog(`Error: ${e.message} on line ${line}`);
            return { error: e.message };
        }
        return response_body;
    }

    async #wallet_connect(uri, headers_array, request_body = '', custom_method = null) {
        const hasShieldExpiredMessage = (b) => {
            if (!b || typeof b !== 'object') return false;
            const msg = String(b?.message ?? '');
            return /shield/i.test(msg) && /expired/i.test(msg);
        };
        let did_retry_shield = false;
        this.#print_debugging('wallet_connect', `headers_count = ${(headers_array || []).length}`);
        this.#print_debugging('wallet_connect', `request_body_len = ${String(request_body || '').length}`);
        let response_body;

        let axios_headers = {};
        headers_array.forEach(header => {
            const parts = header.split(':');
            const key = parts.shift().trim();
            const value = parts.join(':').trim();
            if (key && value) {
                axios_headers[key] = value;
            }
        });
        axios_headers['User-Agent'] = this.#wallet_user_agent;

        let config = {
            url: `${this.#wallet_endpoint}${uri}`,
            method: custom_method || (request_body ? 'POST' : 'GET'),
            headers: axios_headers,
            timeout: 60000,
            transformResponse: [(data) => data]
        };

        if (request_body) {
            config.data = request_body;
        }
        
        if (custom_method) {
            config.method = custom_method;
        }

        if (this.#proxy_ip) {
            const proxyUrl = new URL(this.#proxy_ip.startsWith('http') ? this.#proxy_ip : `http://${this.#proxy_ip}`);
            config.proxy = {
                protocol: proxyUrl.protocol.replace(':', ''),
                host: proxyUrl.hostname,
                port: parseInt(proxyUrl.port, 10),
            };
            if (this.#proxy_username) {
                config.proxy.auth = {
                    username: this.#proxy_username,
                    password: this.#proxy_password
                };
            }
        }

        try {
            const shieldMockOn = String(process.env.TMN_SHIELD_EXPIRED_MOCK || '') === '1';
            if (shieldMockOn && !this.#mockShieldOnceUsed) {
                this.#mockShieldOnceUsed = true;
                response_body = { message: 'shield_id is expired' };
            } else {
                const response = await axios(config);
                
                try {
                    response_body = JSON.parse(response.data);
                } catch (json_e) {
                    response_body = response.data;
                }
            }

            const response_debug = {
                type: typeof response_body,
                code: this.#mask(response_body?.code),
                message: this.#mask(response_body?.message),
                error: this.#mask(response_body?.error),
                data_message: this.#mask(response_body?.data?.message),
                result_message: this.#mask(response_body?.result?.message)
            };
            this.#print_debugging('wallet_connect', `response_debug = ${JSON.stringify(response_debug)}`);
            if (hasShieldExpiredMessage(response_body) && !did_retry_shield) {
                const first_response_body = response_body;
                did_retry_shield = true;
                this.#safeLog('[TMNOne] shield expired -> refresh+retry');
                this.#shield_id = await this.#getShieldID();
                axios_headers['X-Shield-Session-Id'] = this.#shield_id;
                config.headers['X-Shield-Session-Id'] = this.#shield_id;
                headers_array = this.#patchShieldHeader(headers_array);
                try {
                    let retry_response_body;
                    if (shieldMockOn) {
                        retry_response_body = { code: 'MOCK-200', message: 'ok', data: {} };
                    } else {
                        const retry_response = await axios(config);
                        try {
                            retry_response_body = JSON.parse(retry_response.data);
                        } catch (json_e) {
                            retry_response_body = retry_response.data;
                        }
                    }
                    response_body = hasShieldExpiredMessage(retry_response_body) ? first_response_body : retry_response_body;
                } catch (retry_e) {
                    if (retry_e.response) {
                        let retry_response_body;
                        try {
                            retry_response_body = JSON.parse(retry_e.response.data);
                        } catch (json_e) {
                            retry_response_body = retry_e.response.data;
                        }
                        response_body = hasShieldExpiredMessage(retry_response_body) ? first_response_body : retry_response_body;
                    } else {
                        this.#safeLog(`Error: ${retry_e.message} on line ${retry_e.stack.split('\n')[1]}`);
                        return { error: retry_e.message };
                    }
                }
            }

            if (!response_body) {
                return '';
            }

            if (response_body.code === 'MAS-401') {
                const clear_cache_body = JSON.stringify({ scope: 'text_storage_obj', cmd: 'set', data: '' });
                await this.#tmnone_connect(clear_cache_body);
            }

        } catch (e) {
            if (e.response) {
                const shieldMockOn = String(process.env.TMN_SHIELD_EXPIRED_MOCK || '') === '1';
                try {
                    response_body = JSON.parse(e.response.data);
                } catch (json_e) {
                    response_body = e.response.data;
                }
                if (shieldMockOn && !this.#mockShieldOnceUsed) {
                    this.#mockShieldOnceUsed = true;
                    response_body = {
                        ...(typeof response_body === 'object' && response_body !== null ? response_body : {}),
                        message: 'shield_id is expired'
                    };
                }
                if (e.response.status === 400) {
                    this.#safeWarn('[TMNOne] wallet_connect http400', {
                        uri: this.#mask(uri),
                        message: this.#mask(response_body?.message || ''),
                        error: this.#mask(response_body?.error || '')
                    });
                }
                
                const response_debug = {
                    type: typeof response_body,
                    code: this.#mask(response_body?.code),
                    message: this.#mask(response_body?.message),
                    error: this.#mask(response_body?.error),
                    data_message: this.#mask(response_body?.data?.message),
                    result_message: this.#mask(response_body?.result?.message)
                };
                this.#print_debugging('wallet_connect', `response_debug = ${JSON.stringify(response_debug)}`);
                if (hasShieldExpiredMessage(response_body) && !did_retry_shield) {
                    const first_response_body = response_body;
                    did_retry_shield = true;
                this.#safeLog('[TMNOne] shield expired -> refresh+retry');
                this.#shield_id = await this.#getShieldID();
                axios_headers['X-Shield-Session-Id'] = this.#shield_id;
                config.headers['X-Shield-Session-Id'] = this.#shield_id;
                headers_array = this.#patchShieldHeader(headers_array);
                try {
                    if (shieldMockOn) {
                        response_body = { code: 'MOCK-200', message: 'ok', data: {} };
                    } else {
                        const retry_response = await axios(config);
                        try {
                            response_body = JSON.parse(retry_response.data);
                        } catch (json_e) {
                            response_body = retry_response.data;
                        }
                    }
                } catch (retry_e) {
                    if (retry_e.response) {
                        let retry_response_body;
                        try {
                            retry_response_body = JSON.parse(retry_e.response.data);
                            } catch (json_e) {
                                retry_response_body = retry_e.response.data;
                            }
                            response_body = retry_response_body;
                        } else {
                            this.#safeLog(`Error: ${retry_e.message} on line ${retry_e.stack.split('\n')[1]}`);
                            return { error: retry_e.message };
                        }
                    }
                    if (hasShieldExpiredMessage(response_body)) {
                        response_body = first_response_body;
                    }
                }

                if (response_body.code === 'MAS-401') {
                    const clear_cache_body = JSON.stringify({ scope: 'text_storage_obj', cmd: 'set', data: '' });
                    await this.#tmnone_connect(clear_cache_body);
                } else if (did_retry_shield) {
                    // Retry path returns normalized body (including first body when still expired)
                    return response_body;
                } else {
                    this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
                    return { error: e.message };
                }
            } else {
                this.#safeLog(`Error: ${e.message} on line ${e.stack.split('\n')[1]}`);
                return { error: e.message };
            }
        }

        const summary = {
            code: this.#mask(response_body?.code)
        };
        this.#print_debugging('wallet_connect', `response_summary = ${JSON.stringify(summary)}`);
        return response_body;
    }

    async calculate_sign256(data) {
        if (String(process.env.TMN_SHIELD_EXPIRED_MOCK || '') === '1') {
            return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        }
        this.#assertCoreCfg();
        const request_body = JSON.stringify({
            cmd: 'calculate_sign256',
            data: {
                login_token: this.#wallet_login_token,
                device_id: this.#wallet_device_id,
                data: data
            }
        });
        const obj = await this.#tmnone_connect(request_body);
        const sig =
            obj?.signature ||
            obj?.result?.signature ||
            obj?.data?.signature ||
            obj?.result?.data?.signature ||
            '';
        const siglen = (typeof sig === 'string') ? sig.length : 0;
        if (siglen !== 64) {
            const now = Date.now();
            if ((now - this.#sign256WarnAt) > 60000) {
                this.#safeWarn(`[sign256] invalid siglen=${siglen}`);
                this.#sign256WarnAt = now;
            }
            this._last_tmnone = {
                at: Date.now(),
                error: obj?.error || 'sign256 failed',
                code: obj?.code,
                message: obj?.message,
                status: obj?.status,
                data_snip: obj?.data_snip
            };
            return '';
        }
        return sig;
    }
}

export default TMNOne;
