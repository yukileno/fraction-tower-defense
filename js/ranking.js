/**
 * 分数まどうタワーディフェンス - ランキング管理モジュール
 * Googleスプレッドシート連携 & localStorageフォールバックのハイブリッド構成
 */

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzm8hq1cmA551IOYQK_4AmSL3a-y5Xa7dy8HYzvqLoneB4Lz_S_fAmBGBWb9J95lxRc/exec';
const STORAGE_KEY_SCORES = 'fraction_td_ranking_scores';
const STORAGE_KEY_GAS_URL = 'fraction_td_gas_url';
const STORAGE_KEY_PLAYER_NAME = 'fraction_td_player_name';

function getStorageItem(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {}
  return null;
}

function setStorageItem(key, val) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch (e) {}
}

function removeStorageItem(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (e) {}
}

export class RankingManager {
  constructor() {
    this.gasUrl = getStorageItem(STORAGE_KEY_GAS_URL) || DEFAULT_GAS_URL;
  }

  /**
   * GAS Web App URLの取得・設定
   */
  getGasUrl() {
    return this.gasUrl;
  }

  setGasUrl(url) {
    this.gasUrl = (url || '').trim();
    if (this.gasUrl) {
      setStorageItem(STORAGE_KEY_GAS_URL, this.gasUrl);
    } else {
      removeStorageItem(STORAGE_KEY_GAS_URL);
      this.gasUrl = DEFAULT_GAS_URL;
    }
  }

  /**
   * プレイヤー名の取得・保存
   */
  getLastPlayerName() {
    return getStorageItem(STORAGE_KEY_PLAYER_NAME) || '';
  }

  setLastPlayerName(name) {
    if (name) {
      setStorageItem(STORAGE_KEY_PLAYER_NAME, name.trim().slice(0, 12));
    }
  }

  /**
   * ローカルスコアの取得
   */
  getLocalScores() {
    try {
      const data = getStorageItem(STORAGE_KEY_SCORES);
      if (data) {
        const list = JSON.parse(data);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {
      console.warn('ローカルランキングの読み込みに失敗しました:', e);
    }
    // 初期サンプル
    return [
      { name: 'まどうマスター', score: 3800, wave: 'ウェーブ 6', defeated: 24, combo: 12, date: '09/18 08:00' },
      { name: 'すうじの勇者', score: 2500, wave: 'ウェーブ 4', defeated: 15, combo: 8, date: '09/18 08:00' },
      { name: 'みならい魔法使い', score: 1200, wave: 'ウェーブ 2', defeated: 7, combo: 4, date: '09/18 08:00' }
    ];
  }

  /**
   * ローカルスコアの保存（UPSERT: 同名は高いスコアで更新）
   */
  saveLocalScore(entry) {
    const list = this.getLocalScores();
    const safeName = (entry.name || 'ななし').trim().slice(0, 12);
    const score = Number(entry.score) || 0;
    const wave = entry.wave ? (String(entry.wave).includes('ウェーブ') ? String(entry.wave) : `ウェーブ ${entry.wave}`) : 'ウェーブ 1';
    const defeated = Number(entry.defeated) || 0;
    const combo = Number(entry.combo) || 0;
    const dateStr = entry.date || new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const newRecord = {
      name: safeName,
      score,
      wave,
      defeated,
      combo,
      date: dateStr
    };

    let found = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].name === safeName) {
        found = true;
        if (score >= list[i].score) {
          list[i] = newRecord;
        }
        break;
      }
    }

    if (!found) {
      list.push(newRecord);
    }

    // スコア降順ソート
    list.sort((a, b) => b.score - a.score || b.defeated - a.defeated);

    setStorageItem(STORAGE_KEY_SCORES, JSON.stringify(list.slice(0, 50)));
    return list;
  }

  /**
   * ランキング一覧の取得（スプレッドシート優先、エラー時はローカル表示）
   */
  async fetchRanking() {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (this.gasUrl && isOnline) {
      try {
        const sep = this.gasUrl.includes('?') ? '&' : '?';
        const targetUrl = `${this.gasUrl}${sep}app=${encodeURIComponent('分数足し算引き算')}&sheet=${encodeURIComponent('分数足し算引き算')}&game=td&_t=${Date.now()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4秒タイムアウト

        const response = await fetch(targetUrl, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            // スプレッドシートから取得できたデータをローカルにもマージ
            data.forEach(item => this.saveLocalScore(item));
            return {
              success: true,
              source: 'spreadsheet',
              records: data
            };
          }
        }
      } catch (err) {
        console.warn('スプレッドシート連携通信に失敗（ローカル表示にフォールバック）:', err);
      }
    }

    // フォールバック: ローカルストレージ
    const localRecords = this.getLocalScores();
    return {
      success: true,
      source: 'local',
      records: localRecords
    };
  }

  /**
   * スコアを送信・登録
   */
  async submitScore({ name, score, wave, defeated, combo }) {
    const safeName = (name || 'ななし').trim().slice(0, 12);
    this.setLastPlayerName(safeName);

    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const waveStr = wave ? (String(wave).includes('ウェーブ') ? String(wave) : `ウェーブ ${wave}`) : 'ウェーブ 1';

    const entry = {
      app: '分数足し算引き算',
      sheet: '分数足し算引き算',
      game: 'td',
      name: safeName,
      score: Number(score) || 0,
      wave: waveStr,
      defeated: Number(defeated) || 0,
      combo: Number(combo) || 0,
      date: dateStr
    };

    // 1. ローカルに確実に即時保存
    this.saveLocalScore(entry);

    // 2. スプレッドシート（GAS）へ非同期送信
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (this.gasUrl && isOnline) {
      try {
        await fetch(this.gasUrl, {
          method: 'POST',
          mode: 'no-cors', // CORS制約を回避して確実にGASに届ける
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(entry)
        });
        console.log('スプレッドシートへスコアを送信しました');
      } catch (err) {
        console.warn('スプレッドシート送信エラー（ローカル保存済み）:', err);
      }
    }

    return {
      success: true,
      entry
    };
  }
}

export const ranking = new RankingManager();
