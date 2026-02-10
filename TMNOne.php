<?php

class TMNOne
{

	private $tmnone_endpoint = 'https://api.tmn.one/api.php';
	private $wallet_endpoint = 'https://api.tmn.one/proxy.dev.php/tmn-mobile-gateway/';
	private $wallet_user_agent = 'tmnApp/truemoney tmnVersion/5.72.0 tmnBuild/1427 tmnPlatform/android';
	private $wallet_version = '5.72.0';
	private $tmnone_keyid = 0, $wallet_msisdn, $wallet_login_token, $wallet_tmn_id, $wallet_device_id, $wallet_access_token, $proxy_ip = '', $proxy_username = '', $proxy_password = '', $shield_id = '';
	private $debugging = false;
	public $faceauth_webhook_url, $faceauth_wait_timeout = 180;

	public function __construct() {}

	public function setData($tmnone_keyid, $wallet_msisdn, $wallet_login_token, $wallet_tmn_id, $wallet_device_id = '')
	{
		$this->tmnone_keyid = $tmnone_keyid;
		$this->wallet_msisdn = $wallet_msisdn;
		$this->wallet_login_token = $wallet_login_token;
		$this->wallet_tmn_id = $wallet_tmn_id;
		if (empty($wallet_device_id)) {
			$wallet_device_id = hash('sha256', $wallet_msisdn);
		}
		$this->wallet_device_id = $wallet_device_id;
	}

	public function setProxy($proxy_ip, $proxy_username, $proxy_password)
	{
		$this->proxy_ip = $proxy_ip;
		$this->proxy_username = $proxy_username;
		$this->proxy_password = $proxy_password;
	}

	public function setDataWithAccessToken($tmnone_keyid, $wallet_access_token, $wallet_login_token, $wallet_device_id)
	{
		$this->tmnone_keyid = $tmnone_keyid;
		$this->wallet_access_token = $wallet_access_token;
		$this->wallet_login_token = $wallet_login_token;
		$this->wallet_device_id = $wallet_device_id;
	}

	public function enableDebugging()
	{
		$this->debugging = true;
	}

	public function loginWithPin6($wallet_pin)
	{
		try {
			$this->getCachedAccessToken();
			if (!empty($this->wallet_access_token)) {
				return $this->wallet_access_token;
			}
			if (empty($this->shield_id)) {
				$this->shield_id = $this->getShieldID();
			}
			$uri = 'mobile-auth-service/v3/pin/login';
			$wallet_pin = hash('sha256', $this->wallet_tmn_id . $wallet_pin);
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_login_token . '|' . $this->wallet_version . '|' . $this->wallet_device_id . '|' . $wallet_pin);
			$postdata = array();
			$postdata['device_id'] = $this->wallet_device_id;
			$postdata['pin'] = $wallet_pin;
			$postdata['app_version'] = $this->wallet_version;
			$postdata = json_encode($postdata);
			$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_login_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), $postdata);

			if (isset($wallet_response_body['code']) && substr($wallet_response_body['code'], -4) == '-428' && $wallet_response_body['data']['method'] == 'face') {
				$csid = $wallet_response_body['data']['csid'];

				$wallet_response_body = $this->verifyFaceLogin($csid);
			}

			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
			if (!empty($wallet_response_body['data']['access_token'])) {
				$this->wallet_access_token = $wallet_response_body['data']['access_token'];
				$aes_key = hex2bin(substr(hash('sha512', $this->wallet_tmn_id), 0, 64));
				$aes_iv = openssl_random_pseudo_bytes(16);
				$encrypted_access_token = bin2hex($aes_iv) . base64_encode(openssl_encrypt($this->wallet_access_token, 'AES-256-CBC', $aes_key,  OPENSSL_RAW_DATA, $aes_iv));
				$data = ['access_token' => $encrypted_access_token, 'shield_id' => $this->shield_id];
				$request_body = json_encode(array('scope' => 'text_storage_obj', 'cmd' => 'set', 'data' => json_encode($data)));
				$this->tmnone_connect($request_body);

				$this->uploadMetaData();
			}
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		return $this->wallet_access_token;
	}
	
	/*
	ดึงข้อมูลค่าธรรมเนียม และจำนวนรายการที่เข้าเงื่อนไขถูกเก็บค่าธรรมเนียม
	channel = [ refill , p2p , promptpay-in , promptpay-out , datasender_api (สำหรับดึง URL จัดการ API/Webhook) ]
	*/
	public function getWalletFee($channel)
	{
		$request_body = json_encode(array('scope' => 'extra', 'cmd' => 'get_wallet_fees', 'data' => array('login_token' => $this->wallet_login_token, 'device_id' => $this->wallet_device_id, 'access_token' => $this->wallet_access_token, 'fee_channel' => $channel)));
		$result = $this->tmnone_connect($request_body)['result'];
		return $result;
	}

	/*
	ดึง Amity Token (สำหรับใช้งาน Chat บน https://www.tmn.one/amity.html)
	*/
	public function getAmityToken()
	{
		$uri = 'social-composite/v1/authentications/amity-token/';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '-');
		return $wallet_response_body;
	}

	/*
	ดึงยอดเงินคงเหลือ
	*/
	public function getBalance()
	{
		$uri = 'user-profile-composite/v1/users/balance/';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token), '');
		return $wallet_response_body;
	}

	/*
	ดึงรายการ Transaction
	start_date = วันที่เริ่มต้น (inclusive)
	end_date = วันที่สิ้นสุด (exclusive)
	limit = จำนวนรายการสูงสุดต่อหน้า (ไม่เกิน 50 รายการ)
	page = หน้า
	*/
	public function fetchTransactionHistory($start_date, $end_date, $limit = 10, $page = 1)
	{
		$uri = 'history-composite/v1/users/transactions/history/?start_date=' . $start_date . '&end_date=' . $end_date . '&limit=' . $limit . '&page=' . $page . '&type=&action=';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '');
		return $wallet_response_body;
	}

	/*
	ดึงรายละเอียด Transaction
	report_id = report_id ที่ได้มาจากขั้นตอน fetchTransactionHistory
	*/
	public function fetchTransactionInfo($report_id)
	{
		$cache_filename = sys_get_temp_dir() . '/tmn-' . $report_id;
		$aes_key = hex2bin(substr(hash('sha512', $this->wallet_tmn_id), 0, 64));
		if (file_exists($cache_filename)) {
			$wallet_response_body = file_get_contents($cache_filename);
			$aes_iv = hex2bin(substr($wallet_response_body, 0, 32));
			$wallet_response_body = openssl_decrypt(substr($wallet_response_body, 32), 'AES-256-CBC', $aes_key,  OPENSSL_RAW_DATA, $aes_iv);
			$wallet_response_body = json_decode($wallet_response_body, true);
			$wallet_response_body['cached'] = true;
			return $wallet_response_body;
		}
		$uri = 'history-composite/v1/users/transactions/history/detail/' . $report_id . '?version=1';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '');
		if (!empty($wallet_response_body['data'])) {
			$aes_iv = openssl_random_pseudo_bytes(16);
			$encrypted_wallet_response_body = bin2hex($aes_iv) . openssl_encrypt(json_encode($wallet_response_body['data']), 'AES-256-CBC', $aes_key,  OPENSSL_RAW_DATA, $aes_iv);
			@file_put_contents($cache_filename, $encrypted_wallet_response_body);
		}
		return $wallet_response_body;
	}

	/*
	ตรวจสอบ QR Code บนสลิปโอนเงิน
	qr_data = ข้อมูล raw data ใน QR Code บนสลิป
	*/
	public function fetchQRDetail($qr_data)
	{
		$uri = 'history-composite/v1/users/transactions/history/qr-detail/' . $qr_data;
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '');
		return $wallet_response_body;
	}

	/*
	ดูประวัติการส่งซองอั่งเปา
	*/
	public function fetchVoucherHistory()
	{
		$uri = 'transfer-composite/v1/vouchers/?limit=20&page=0';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '');
		return $wallet_response_body;
	}

	/*
	สั่งซองอั่งเปา
	amount = จำนวนเงิน
	detail = รายละเอียดซอง
	*/
	public function generateVoucher($amount, $detail = '')
	{
		try {
			$uri = 'transfer-composite/v1/vouchers/';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_access_token . '|F|' . $amount . '|1|' . $detail);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"amount":"' . $amount . '","detail":"' . $detail . '","duration":24,"isnotify":true,"tmn_id":"' . $this->wallet_tmn_id . '","mobile":"' . $this->wallet_msisdn . '","voucher_type":"F","member":"1"}'
			);

			if (isset($wallet_response_body['code']) && substr($wallet_response_body['code'], -4) == '-428') {
				$csid = $wallet_response_body['data']['csid'];
				if($wallet_response_body['data']['method'] == 'face')
				{
					$wallet_response_body = $this->verifyFace($csid);
				}
				else
				{
					$wallet_response_body = $this->verifyOtp($csid);
				}			}

			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
			//{"code":"TRC-200","data":{"tmn_id":"tmn.xxxxxx","amount":1.00,"link":"0000000000f3453f62bd07185708325c38N","mobile":"0987654321","weight":0.4,"link_voucher":"https://gift.truemoney.com/campaign/?v=0000000000f3453f62bd07185708325c38N/#/voucher_detail/","utiba_id":50020690000000,"type":"R","update_date":1683893000100,"expire_date":1684153000100,"link_redeem":"https://gift.truemoney.com/campaign/?v=0000000000f3453f62bd07185708325c38N","member":1,"voucher_id":299291608745000000,"detail":"TEXT","create_date":1683893000100,"status":"active"}}
			return $wallet_response_body;
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
	}

	/*
	ดึงข้อมูลเบอร์ Wallet
	payee_wallet_id = เบอร์ Wallet ที่ต้องการตรวจสอบ
	*/
	public function getRecipientInfo($payee_wallet_id)
	{
		$uri = 'user-profile-composite/v1/users/public-profile/' . $payee_wallet_id;
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri);
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '');
		return $wallet_response_body;
	}

	/*
	โอนเงิน P2P
	payee_wallet_id = เบอร์ Wallet ปลายทาง
	amount = จำนวนเงิน
	personal_msg = ข้อความ
	*/
	public function transferP2P($payee_wallet_id, $amount, $personal_msg = '')
	{
		try {
			$amount = number_format($amount, 2, '.', '');
			$uri = 'transfer-composite/v2/p2p-transfer/draft-transactions';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_access_token . '|' . $amount . '|' . $payee_wallet_id);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"amount":"' . $amount . '","message":"' . $personal_msg . '","receiverId":"' . $payee_wallet_id . '"}'
			);
			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
			$draft_transaction_id = $wallet_response_body['data']['draft_transaction_id'];
			$reference_key = $wallet_response_body['data']['reference_key'];

			$uri = 'transfer-composite/v2/p2p-transfer/transactions/' . $draft_transaction_id;
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_access_token . '|' . $reference_key);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"reference_key":"' . $reference_key . '"}'
			);

			if (isset($wallet_response_body['code']) && substr($wallet_response_body['code'], -4) == '-428') {
				$csid = $wallet_response_body['data']['csid'];
				if($wallet_response_body['data']['method'] == 'face')
				{
					$wallet_response_body = $this->verifyFace($csid);
				}
				else
				{
					$wallet_response_body = $this->verifyOtp($csid);
				}
			}

			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		$wallet_response_body['draft_transaction_id'] = $draft_transaction_id;
		return $wallet_response_body;
	}

	/*
	ดึงสถานะการโอนเงิน P2P
	draft_transaction_id = draft_transaction_id จากขั้นตอน transferP2P
	*/
	public function getTransferP2PStatus($draft_transaction_id)
	{
		$uri = 'transfer-composite/v2/p2p-transfer/transactions/' . $draft_transaction_id . '/status';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token);
		$wallet_response_body = $this->wallet_connect(
			$uri,
			array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
			''
		);
		return $wallet_response_body;
	}

	/*
	โอนเงินพร้อมเพย์
	payee_proxy_value = หมายเลขพร้อมเพย์ (เบอร์โทร/บัตรประชาชน)
	amount = จำนวนเงิน
	*/
	public function transferQRPromptpay($payee_proxy_value, $amount)
	{
		try {
			$amount = number_format($amount, 2, '.', '');
			$uri = 'transfer-composite/v1/promptpay/inquiries';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_access_token . '|' . $amount . '|' . $payee_proxy_value . '|QR');
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"amount":"' . $amount . '","input_method":"QR","to_proxy_value":"' . $payee_proxy_value . '"}'
			);

			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
			$draft_transaction_id = $wallet_response_body['data']['draft_transaction_id'];

			$uri = 'transfer-composite/v1/promptpay/transfers';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_access_token . '|' . $draft_transaction_id);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"ref_number":"' . $draft_transaction_id . '"}'
			);

			if (isset($wallet_response_body['code']) && substr($wallet_response_body['code'], -4) == '-428') {
				$csid = $wallet_response_body['data']['csid'];
				if($wallet_response_body['data']['method'] == 'face')
				{
					$wallet_response_body = $this->verifyFace($csid);
				}
				else
				{
					$wallet_response_body = $this->verifyOtp($csid);
				}
			}

			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		return $wallet_response_body;
	}

	/*
	โอนเงินเข้าบัญชีธนาคาร
	bank_code = SCB,BBL,BAY,KBANK,KTB,TTB,CIMB,LHBANK,UOB,KKP,GSB,BAAC,GHB,ISBT,TISCO,TCRB
	amount = จำนวนเงิน
	wallet_pin = PIN 6 หลักของ Wallet
	*/
	public function transferBankAC($bank_code, $bank_ac, $amount, $wallet_pin)
	{
		try {
			$amount = number_format($amount, 2, '.', '');
			$signature = $this->calculate_sign256($amount . '|' . $bank_code . '|' . $bank_ac);
			$wallet_response_body = $this->wallet_connect(
				'fund-composite/v1/withdrawal/draft-transaction',
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"bank_name":"' . $bank_code . '","bank_account":"' . $bank_ac . '","amount":"' . $amount . '"}'
			);
			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
			$draft_transaction_id = $wallet_response_body['data']['draft_transaction_id'];

			$uri = 'fund-composite/v3/withdrawal/transaction';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_access_token . '|' . $draft_transaction_id);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
				'{"draft_transaction_id":"' . $draft_transaction_id . '"}'
			);

			if (isset($wallet_response_body['code']) && substr($wallet_response_body['code'], -4) == '-428' && $wallet_response_body['data']['method'] == 'pin') {
				$csid = $wallet_response_body['data']['csid'];

				$wallet_pin = hash('sha256', $this->wallet_tmn_id . $wallet_pin);
				$signature = $this->calculate_sign256($this->wallet_access_token . '|' . $csid . '|' . $wallet_pin . '|manual_input');
				$wallet_response_body = $this->wallet_connect(
					'mobile-auth-service/v1/authentications/pin',
					array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid),
					'{"pin":"' . $wallet_pin . '","method":"manual_input"}'
				);
			}

			if (isset($wallet_response_body['code']) && substr($wallet_response_body['code'], -4) == '-428') {
				$csid = $wallet_response_body['data']['csid'];
				if($wallet_response_body['data']['method'] == 'face')
				{
					$wallet_response_body = $this->verifyFace($csid);
				}
				else
				{
					$wallet_response_body = $this->verifyOtp($csid);
				}			}

			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') //{"code":"FNC-200","data":{"withdraw_status":"VERIFIED"}}
			{
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage() . ' (line:' . $e->getLine() . ')');
		}
		return $wallet_response_body;
	}

	/*
	สร้าง QR จ่ายเงิน (7-11 , ร้านค้าต่างๆ)
	ได้รับ data->payment_code เพื่อสร้าง QR Code สำหรับจ่ายเงิน
	*/
	public function getPaymentCode()
	{
		$uri = 'payment-composite/v2/payment-codes/';
		$timestamp = floor(microtime(true) * 1000);
		$signature = $this->calculate_sign256($this->wallet_tmn_id . '|BALANCE');
		$wallet_response_body = $this->wallet_connect(
			$uri,
			array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id),
			'{"asset_id":"' . $this->wallet_tmn_id . '","asset_type":"BALANCE","signature":"' . $signature . '"}'
		);
		return $wallet_response_body;
	}

	private function getCachedAccessToken()
	{
		$request_body = json_encode(array('scope' => 'text_storage_obj', 'cmd' => 'get'));
		$data = $this->tmnone_connect($request_body)['data'];
		$data = json_decode($data, true);
		$encrypted_access_token = (!empty($data['access_token']) ? $data['access_token'] : '');
		$this->shield_id = (!empty($data['shield_id']) ? $data['shield_id'] : '');
		if (!empty($encrypted_access_token)) {
			$aes_key = hex2bin(substr(hash('sha512', $this->wallet_tmn_id), 0, 64));
			$aes_iv = hex2bin(substr($encrypted_access_token, 0, 32));
			$access_token = openssl_decrypt(base64_decode(substr($encrypted_access_token, 32)), 'AES-256-CBC', $aes_key,  OPENSSL_RAW_DATA, $aes_iv);
			if (!empty($access_token)) {
				$this->wallet_access_token = $access_token;
			}
		}
	}

	private function getShieldID()
	{
		$request_body = json_encode(array('scope' => 'extra', 'cmd' => 'get_shield_id', 'data' => array('device_id' => $this->wallet_device_id)));
		$shield_id = $this->tmnone_connect($request_body)['shield_id'];
		return $shield_id;
	}

	private function verifyFaceLogin($csid)
	{
		try {

			$uri = 'mobile-auth-service/v2/login-token-authentications/face';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_login_token . '|' . $csid);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_login_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid, 'os-version: 15', 'tmn-app-version: ' . $this->wallet_version, 'verify-token: android', 'channel: android'),
				'-'
			);
			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}

			$session_id = $wallet_response_body['data']['session_id'];

			$request_body = json_encode(array('scope' => 'extra', 'cmd' => 'face_verify_v2', 'data' => array('session_id' => $session_id)));
			$this->tmnone_connect($request_body);

			if (!empty($this->faceauth_webhook_url)) {
				$this->print_debugging('tmnone_connect', 'faceauth_webhook_url = ' . $this->faceauth_webhook_url);
				$curl = curl_init($this->faceauth_webhook_url);
				curl_setopt($curl, CURLOPT_TIMEOUT, 10);
				curl_setopt($curl, CURLOPT_HEADER, false);
				curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
				curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
				curl_setopt($curl, CURLOPT_POST, true);
				curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode(['wallet_msisdn' => $this->wallet_msisdn]));
				$this->print_debugging('tmnone_connect', 'faceauth_webhook_response = ' . curl_exec($curl));
				curl_close($curl);
			}

			$face_verify_successful = false;
			$this->print_debugging('tmnone_connect', 'faceauth_wait_timeout = ' . $this->faceauth_wait_timeout);
			for ($i = 0; $i < $this->faceauth_wait_timeout; $i++) {
				$request_body = json_encode(array('scope' => 'extra', 'cmd' => 'face_verify_v2', 'data' => array('session_id' => $session_id)));
				$verification_result = $this->tmnone_connect($request_body);
				if (isset($verification_result['data']['status']) && $verification_result['data']['status'] == 1) {
					$face_verify_successful = true;
					break;
				}
				sleep(2);
			}

			if (!$face_verify_successful) {
				throw new Exception('Liveness Check Timeout');
			}

			$uri = 'mobile-auth-service/v2/login-token-authentications/face/' . $session_id . '/status';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' .  $this->wallet_login_token . '|' . $csid);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_login_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid),
				''
			);
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		return $wallet_response_body;
	}

	private function verifyFace($csid)
	{
		try {
			$uri = 'mobile-auth-service/v2/authentications/face';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token . '|' . $csid);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid, 'os-version: 15', 'tmn-app-version: ' . $this->wallet_version, 'verify-token: android', 'channel: android'),
				'-'
			);
			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}

			$session_id = $wallet_response_body['data']['session_id'];

			$request_body = json_encode(array('scope' => 'extra', 'cmd' => 'face_verify_v2', 'data' => array('session_id' => $session_id)));
			$this->tmnone_connect($request_body);

			if (!empty($this->faceauth_webhook_url)) {
				$this->print_debugging('tmnone_connect', 'faceauth_webhook_url = ' . $this->faceauth_webhook_url);
				$curl = curl_init($this->faceauth_webhook_url);
				curl_setopt($curl, CURLOPT_TIMEOUT, 10);
				curl_setopt($curl, CURLOPT_HEADER, false);
				curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
				curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
				curl_setopt($curl, CURLOPT_POST, true);
				curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode(['wallet_msisdn' => $this->wallet_msisdn]));
				$this->print_debugging('tmnone_connect', 'faceauth_webhook_response = ' . curl_exec($curl));
				curl_close($curl);
			}

			$face_verify_successful = false;
			$this->print_debugging('tmnone_connect', 'faceauth_wait_timeout = ' . $this->faceauth_wait_timeout);
			for ($i = 0; $i < $this->faceauth_wait_timeout; $i++) {
				$request_body = json_encode(array('scope' => 'extra', 'cmd' => 'face_verify_v2', 'data' => array('session_id' => $session_id)));
				$verification_result = $this->tmnone_connect($request_body);
				if (isset($verification_result['data']['status']) && $verification_result['data']['status'] == 1) {
					$face_verify_successful = true;
					break;
				}
				sleep(2);
			}

			if (!$face_verify_successful) {
				throw new Exception('Liveness Check Timeout');
			}

			$uri = 'mobile-auth-service/v2/authentications/face/' . $session_id . '/status';
			$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token . '|' . $csid);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid),
				''
			);
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		return $wallet_response_body;
	}

	private function verifyOtp($csid)
	{
		try {
			$uri = 'mobile-auth-service/v1/authentications/otp';
			$signature = $this->calculate_sign256($this->wallet_access_token . '|' . $csid . '|' . '/tmn-mobile-gateway/' . $uri);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid, 'os-version: 15', 'tmn-app-version: ' . $this->wallet_version, 'verify-token: android', 'channel: android'),
				''
			);
			if (empty($wallet_response_body['code']) || substr($wallet_response_body['code'], -4) != '-200') {
				throw new Exception($wallet_response_body['code'] . ' - ' . $wallet_response_body['message']);
			}

			$otp_reference = $wallet_response_body['data']['otp_reference'];
			$otp = '';

			$this->print_debugging('tmnone_connect', 'faceauth_wait_timeout = ' . $this->faceauth_wait_timeout);
			$otp_filename = 'otp_' . $otp_reference . '.txt';
			for ($i = 0; $i < $this->faceauth_wait_timeout; $i++) {
				$this->print_debugging('tmnone_connect', 'checking file ' . $otp_filename);
				if(file_exists($otp_filename))
				{
					$filedata = file_get_contents($otp_filename);
					preg_match_all('/(?<otp>\d{6})/', $filedata, $matches, PREG_PATTERN_ORDER, 0);
					if (isset($matches['otp'][0])) {
						$otp = $matches['otp'][0];
						@unlink($otp_filename);
						break;
					}
				}
				sleep(2);
			}

			if (!$otp) {
				throw new Exception('Otp Wait Timeout');
			}

			$this->print_debugging('tmnone_connect', 'otp = ' . $otp);

			$uri = 'mobile-auth-service/v1/authentications/otp';
			//35134c45-e9d7-40e7-967a-fb63740abbf5|7899acc7-8e84-4f64-b01c-747bb1bda6bb|123456|RYZY
			$signature = $this->calculate_sign256($this->wallet_access_token . '|' . $csid . '|' . $otp . '|' . $otp_reference);
			$wallet_response_body = $this->wallet_connect(
				$uri,
				array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id, 'CSID: ' . $csid),
				'{"otp":"' . $otp . '","otp_ref":"' . $otp_reference . '"}'
			);
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		return $wallet_response_body;
	}

	private function uploadMetaData()
	{
		$date_time = date('d/m/Y H:i');
		$disk_diff = crc32($this->wallet_device_id) % 1073741824;
		$diskspace_total = 118489088000 - $disk_diff;
		$diskspace_used = 21474836480 + $disk_diff;
		$diskspace_free = $diskspace_total - $diskspace_used;
		$app_first_installation = 1704067200000 + (crc32($this->wallet_device_id) % 31536000); //Monday, 1 January 2024 00:00:00 with 1Y offset
		$uri = 'device-composite/v1/users/device-metadata';
		$signature = $this->calculate_sign256('/tmn-mobile-gateway/' . $uri . '|' . $this->wallet_access_token . '|TrueMoney|100|' . $date_time . '|11855978496|false|15');
		$wallet_response_body = $this->wallet_connect($uri, array('Content-Type: application/json', 'Authorization: ' . $this->wallet_access_token, 'signature: ' . $signature, 'X-Device: ' . $this->wallet_device_id, 'X-Geo-Location: city=; country=; country_code=', 'X-Geo-Position: lat=; lng=', 'X-Shield-Session-Id: ' . $this->shield_id), '{"app_first_installation":' . $app_first_installation . ',"app_name":"TrueMoney","app_package_name":"th.co.truemoney.wallet","app_version":"' . $this->wallet_version . '","battery_level":100,"binding_devices_count":0,"build_product":"e2sxeea","cell_connected":false,"connected_ssid":"\u003cunknown ssid\u003e","contact_count":0,"contact_list":[],"cpu_num":0,"data_epoch_time":"' . $date_time . '","device_model":"SM-S926B","device_os":"android","device_type":"","diskspace_free":' . $diskspace_free . ',"diskspace_total":' . $diskspace_total . ',"diskspace_used":' . $diskspace_used . ',"gps_coord":{"latitude":"","longitude":""},"installed_apps":[],"installed_package_names":[],"internet_type":"","mobile_dbm":"","network_type":"WIFI","os_version":"15","photo_count":0,"ramsize_total":11855978496,"resolution":{"display":"1467","width":"720"},"running_package_names":[],"sim_carrier":"","sim_state":"SIM_STATE_ABSENT","sms_count":0,"timezone":"Asia/Bangkok","vpn_connected":false,"wifi_connected":true}');
		return isset($wallet_response_body['code']) ? $wallet_response_body : array();
	}

	private function print_debugging($tag, $message)
	{
		if ($this->debugging) {
			echo $tag . "\t" . $message . PHP_EOL;
		}
	}

	private function tmnone_connect($request_body)
	{
		$this->print_debugging('tmnone_connect', 'request_body = ' . $request_body);
		$response_body = '';
		try {
			$headers = [];
			$aes_key = hex2bin(substr(hash('sha512', $this->wallet_login_token), 0, 64));
			$aes_iv = openssl_random_pseudo_bytes(16);
			$request_body = bin2hex($aes_iv) . base64_encode(openssl_encrypt($request_body, 'AES-256-CBC', $aes_key,  OPENSSL_RAW_DATA, $aes_iv));
			$request_body = json_encode(array('encrypted' => $request_body));
			$curl = curl_init($this->tmnone_endpoint);
			curl_setopt($curl, CURLOPT_TIMEOUT, 60);
			curl_setopt($curl, CURLOPT_HEADER, false);
			curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
			curl_setopt($curl, CURLOPT_HTTPHEADER, array('X-KeyID: ' . $this->tmnone_keyid, 'Content-Type: application/json'));
			curl_setopt($curl, CURLOPT_USERAGENT, 'okhttp/4.4.0/202601302100/' . $this->tmnone_keyid);
			curl_setopt($curl, CURLOPT_POST, true);
			curl_setopt($curl, CURLOPT_VERBOSE, false);
			curl_setopt($curl, CURLOPT_POSTFIELDS, $request_body);
			curl_setopt(
				$curl,
				CURLOPT_HEADERFUNCTION,
				function ($curl, $header) use (&$headers) {
					$len = strlen($header);
					$header = explode(':', $header, 2);
					if (count($header) < 2) // ignore invalid headers
					{
						return $len;
					}

					$headers[strtolower(trim($header[0]))] = trim($header[1]);

					return $len;
				}
			);
			$response_body = curl_exec($curl);
			if ($response_body === false) {
				throw new Exception(curl_error($curl));
			}
			curl_close($curl);
			if (!empty($headers['x-wallet-user-agent'])) {
				$this->wallet_user_agent = $headers['x-wallet-user-agent'];
			}
			if (!empty($headers['x-wallet-app-version'])) {
				$this->wallet_version = $headers['x-wallet-app-version'];
			}
			$response_body = json_decode($response_body, true);
			if (isset($response_body['encrypted'])) {
				$response_body = openssl_decrypt(base64_decode($response_body['encrypted']), 'AES-256-CBC', $aes_key,  OPENSSL_RAW_DATA, $aes_iv);
				$response_body = json_decode($response_body, true);
			}
			$this->print_debugging('tmnone_connect', 'response_body = ' . json_encode($response_body));
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		return $response_body;
	}

	private function wallet_connect($uri, $headers, $request_body = '', $custom_method = null)
	{
		$this->print_debugging('wallet_connect', 'headers = ' . json_encode($headers));
		$this->print_debugging('wallet_connect', 'request_body = ' . $request_body);
		$response_body = '';
		try {
			$curl = curl_init($this->wallet_endpoint . $uri);
			curl_setopt($curl, CURLOPT_TIMEOUT, 60);
			curl_setopt($curl, CURLOPT_HEADER, false);
			curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
			curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
			curl_setopt($curl, CURLOPT_VERBOSE, false);
			curl_setopt($curl, CURLOPT_USERAGENT, $this->wallet_user_agent);
			if (!empty($this->proxy_ip)) {
				curl_setopt($curl, CURLOPT_PROXY, $this->proxy_ip);
				if (!empty($this->proxy_username)) {
					curl_setopt($curl, CURLOPT_PROXYUSERPWD, $this->proxy_username . ':' . $this->proxy_password);
				}
			}
			if (!empty($request_body)) {
				curl_setopt($curl, CURLOPT_POST, true);
				curl_setopt($curl, CURLOPT_POSTFIELDS, $request_body);
			}
			if (!empty($custom_method)) {
				curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $custom_method);
			}
			$response_body = curl_exec($curl);
			if ($response_body === false) {
				throw new Exception(curl_error($curl));
			}
			curl_close($curl);
			$response_body = json_decode($response_body, true);
			if (empty($response_body)) {
				return '';
			}
			if (isset($response_body['code']) && $response_body['code'] == 'MAS-401') {
				$request_body = json_encode(array('scope' => 'text_storage_obj', 'cmd' => 'set', 'data' => ''));
				$this->tmnone_connect($request_body);
			}
		} catch (Exception $e) {
			echo 'Error: ' . $e->getMessage() . ' on line ' . $e->getLine() . ' of ' . $e->getFile() . PHP_EOL;
			return array('error' => $e->getMessage());
		}
		$this->print_debugging('wallet_connect', 'response_body = ' . json_encode($response_body));
		return $response_body;
	}

	public function calculate_sign256($data)
	{
		$request_body = json_encode(array('cmd' => 'calculate_sign256', 'data' => array('login_token' => $this->wallet_login_token, 'device_id' => $this->wallet_device_id, 'data' => $data)));
		return isset($this->tmnone_connect($request_body)['signature']) ? $this->tmnone_connect($request_body)['signature'] : '';
	}
}
