/**
 * pdv.js — K-Logistics PDV 기록 모듈 v1.0
 * gopang-proxy /pdv/report 엔드포인트 연동
 * traffic/pdv.js 패턴 준수 — 물류 이벤트 특화
 */

const PROXY   = 'https://gopang-proxy.tensor-city.workers.dev';
const SVC_ID  = 'logistics';
const PDV_VER = '1.0';

function _getUserIpv6() {
  try {
    const s = JSON.parse(sessionStorage.getItem('gopang_sso_token') || 'null');
    return s?.ipv6 || 'anonymous';
  } catch { return 'anonymous'; }
}

async function _hashReport(obj) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(JSON.stringify(obj))
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

async function _sendToPDV(reportPayload) {
  try {
    const res = await fetch(`${PROXY}/pdv/report`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ report: reportPayload }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `PDV HTTP ${res.status}`);
    }
    const ack = await res.json();
    console.info('[K-Logistics PDV] 기록 완료:', ack.pdv_entry);
    return ack;
  } catch(e) {
    console.warn('[K-Logistics PDV] 전송 실패 (로컬 백업):', e.message);
    _localBackup(reportPayload);
    return null;
  }
}

function _localBackup(payload) {
  try {
    const key  = 'klogistics_pdv_pending';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({ payload, failedAt: new Date().toISOString() });
    if (list.length > 200) list.splice(0, list.length - 200);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

async function _flushPending() {
  try {
    const key  = 'klogistics_pdv_pending';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    if (!list.length) return;
    const failed = [];
    for (const item of list) {
      const ack = await _sendToPDV(item.payload);
      if (!ack) failed.push(item);
    }
    localStorage.setItem(key, JSON.stringify(failed));
  } catch {}
}

// ═══════════════════════════════════════════════════════════
const PDV = {

  /**
   * 배송 요청 기록
   * @param {object} opts — { from, to, cargo, weight, cargoType, estimatedGdc }
   */
  async writeShipRequest({ from='', to='', cargo='', weight=0, cargoType='일반', estimatedGdc=0 } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-req-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_ship_request', id,
      content_hash: await _hashReport({ id, from, to, cargo, now }),
      who:  { ipv6, role: 'shipper', recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: from },
      what: {
        summary: `배송 요청: ${from} → ${to} | ${cargo}`,
        from, to, cargo, weight,
        cargo_type:    cargoType,
        estimated_gdc: estimatedGdc,
      },
      how:  { method: 'K-Logistics AI 동선 겹침 매칭' },
      why:  { goal: '최적 운송 차량 연결', triggered: 'logistics_ship_request' },
    });
  },

  /**
   * 배송 출발 기록 (운전자 수락 후)
   * @param {object} opts — { from, to, driverIpv6, vehicleNo, cargo, confirmedGdc }
   */
  async writeShipStart({ from='', to='', driverIpv6='', vehicleNo='', cargo='', confirmedGdc=0 } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-start-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_ship_start', id,
      content_hash: await _hashReport({ id, from, to, vehicleNo, now }),
      who: { ipv6, role: 'shipper', counterparty: driverIpv6, recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: from },
      what: {
        summary: `배송 출발: ${from} → ${to} | 차량 ${vehicleNo}`,
        from, to, cargo, vehicle_no: vehicleNo,
        driver_ipv6: driverIpv6, confirmed_gdc: confirmedGdc,
      },
      how:  { method: 'PDV 신원 상호 확인 후 수령 + 실시간 경로 기록' },
      why:  { goal: '배송 기록 보관 및 분쟁 예방', triggered: 'logistics_ship_start' },
    });
  },

  /**
   * 배송 완료 + GDC 결제 기록
   * @param {object} opts — { from, to, driverIpv6, vehicleNo, cargo, gdc, shipId, durationMin }
   */
  async writeShipEnd({ from='', to='', driverIpv6='', vehicleNo='', cargo='', gdc=0, shipId='', durationMin=0 } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-end-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_ship_end', id,
      content_hash: await _hashReport({ id, shipId, gdc, now }),
      who: { ipv6, role: 'shipper', counterparty: driverIpv6, recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: to },
      what: {
        summary: `배송 완료: ${from} → ${to} | ${gdc} GDC 결제`,
        from, to, cargo, vehicle_no: vehicleNo,
        driver_ipv6: driverIpv6, gdc_paid: gdc,
        ship_id: shipId, duration_min: durationMin,
      },
      how:  { method: '목적지 수령 확인 → GDC 자동 이체 → PDV 양측 기록 → OpenHash 증빙' },
      why:  { goal: 'GDC 결제 증거 보관 및 분쟁 예방', triggered: 'logistics_ship_end' },
    });
  },

  /**
   * 릴레이 인수인계 기록 (중간 거점)
   * @param {object} opts — { location, fromDriver, toDriver, cargo, shipId }
   */
  async writeRelay({ location='', fromDriver='', toDriver='', cargo='', shipId='' } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-relay-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_relay', id,
      content_hash: await _hashReport({ id, location, fromDriver, toDriver, now }),
      who: { ipv6, role: 'shipper', recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: location },
      what: {
        summary: `릴레이 인수인계: ${location} | ${cargo}`,
        location, from_driver: fromDriver, to_driver: toDriver,
        cargo, ship_id: shipId,
      },
      how:  { method: 'OpenHash 릴레이 거점 인수인계 기록' },
      why:  { goal: '중간 인수인계 증거 보존', triggered: 'logistics_relay' },
    });
  },

  /**
   * 냉장/냉동 온도 이탈 이상 감지 기록
   * @param {object} opts — { vehicleNo, cargo, location, tempRequired, tempActual, shipId }
   */
  async writeTempAlert({ vehicleNo='', cargo='', location='', tempRequired=0, tempActual=0, shipId='' } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-temp-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_temp_alert', id,
      content_hash: await _hashReport({ id, vehicleNo, shipId, now }),
      who: { ipv6, role: 'system', recipients: ['gopang-pdv', 'logistics-ops'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: location },
      what: {
        summary: `⚠ 온도 이탈: ${cargo} | 요구 ${tempRequired}℃ → 실제 ${tempActual}℃`,
        vehicle_no: vehicleNo, cargo, location,
        temp_required: tempRequired, temp_actual: tempActual, ship_id: shipId,
      },
      how:  { method: 'IoT 온도 센서 → K-Logistics AI 실시간 감지' },
      why:  { goal: '냉장 물류 품질 보증 및 손해배상 증거 보존', triggered: 'logistics_temp_alert' },
      analysis: { risk_level: 'high' },
    });
  },

  /**
   * 수취인 확인 기록
   * @param {object} opts — { location, receiverIpv6, driverIpv6, cargo, shipId }
   */
  async writeDeliveryConfirm({ location='', receiverIpv6='', driverIpv6='', cargo='', shipId='' } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-confirm-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_delivery_confirm', id,
      content_hash: await _hashReport({ id, shipId, receiverIpv6, now }),
      who: { ipv6: receiverIpv6 || ipv6, role: 'receiver', counterparty: driverIpv6, recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: location },
      what: {
        summary: `수령 확인: ${cargo} | ${location}`,
        location, cargo, ship_id: shipId,
        receiver_ipv6: receiverIpv6, driver_ipv6: driverIpv6,
      },
      how:  { method: 'PDV 수령 확인 서명 + OpenHash 불변 기록' },
      why:  { goal: '배송 완료 증거 보존 및 GDC 결제 트리거', triggered: 'logistics_delivery_confirm' },
    });
  },

  /**
   * 상호 평가 기록
   * @param {object} opts — { targetIpv6, targetRole, score, comment, shipId }
   */
  async writeRating({ targetIpv6='', targetRole='driver', score=5, comment='', shipId='' } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-rating-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_rating', id,
      content_hash: await _hashReport({ id, targetIpv6, score, shipId, now }),
      who: { ipv6, role: 'rater', counterparty: targetIpv6, recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: 'K-Logistics 평가' },
      what: {
        summary: `${targetRole} 평가: ${score}점 — ${comment.slice(0,50)}`,
        target_ipv6: targetIpv6, target_role: targetRole,
        score, comment, ship_id: shipId,
      },
      how:  { method: 'PDV 기반 위변조 불가 상호 평가' },
      why:  { goal: '신뢰 점수 구축 및 서비스 품질 향상', triggered: 'logistics_rating' },
    });
  },

  /**
   * 이상 화물 신고 기록
   * @param {object} opts — { location, description, vehicleNo, driverIpv6, shipId }
   */
  async writeCargoAlert({ location='', description='', vehicleNo='', driverIpv6='', shipId='' } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-logistics-alert-${Date.now()}`;
    return _sendToPDV({
      svc: SVC_ID, type: 'logistics_cargo_alert', id,
      content_hash: await _hashReport({ id, location, vehicleNo, now }),
      who: { ipv6, role: 'shipper', counterparty: driverIpv6, recipients: ['gopang-pdv', 'logistics-ops'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: 'https://logistics.hondi.net', label: location },
      what: {
        summary: `화물 이상 신고: ${description}`,
        location, vehicle_no: vehicleNo, driver_ipv6: driverIpv6,
        description, ship_id: shipId,
      },
      how:  { method: '이상 감지 버튼 → 물류 운영팀 알림 + PDV 즉시 기록' },
      why:  { goal: '화물 파손·분실 증거 보존 및 즉각 대응', triggered: 'logistics_cargo_alert' },
      analysis: { risk_level: 'critical' },
    });
  },

  /**
   * AI 상담 기록
   * @param {object} opts — { userMsg, aiMsg, category, svc }
   */
  async writeConsult({ userMsg='', aiMsg='', category='consult', svc=SVC_ID } = {}) {
    const ipv6 = _getUserIpv6();
    const now  = new Date().toISOString();
    const id   = `RPT-${svc}-consult-${Date.now()}`;
    return _sendToPDV({
      svc, type: `${svc}_consult`, id,
      content_hash: await _hashReport({ id, userMsg, now }),
      who: { ipv6, role: 'user', recipients: ['gopang-pdv'] },
      when: { generated_at: now, period_start: now, period_end: now },
      where: { svc_url: `https://${svc}.hondi.net`, label: 'AI 상담' },
      what: {
        summary: `AI 상담 (${category}): ${userMsg.slice(0,60)}`,
        user_msg: userMsg, ai_msg: aiMsg, category,
      },
      how:  { method: `${svc} AI 채팅` },
      why:  { goal: 'AI 상담 기록 보관', triggered: `${svc}_consult` },
    });
  },

  flushPending: _flushPending,
};

window.addEventListener('load', () => setTimeout(_flushPending, 3000));
window.PDV = PDV;
