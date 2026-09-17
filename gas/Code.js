/**
 * 通分マスター & 分数タワーディフェンス 統合スコアランキング Web API (GAS)
 * 
 * スプレッドシート: 10QgA_xLFwK423Rv0xBeoafsbmPr_DeVS7-zU1rwLb5s
 * - 既存シート: 'Scores' (通分マスター)
 * - 追加シート: '分数タワーディフェンス' (分数まどうタワーディフェンス)
 */

function getTargetSheet(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const app = (params && (params.app || params.game || params.unit || params.sheet)) || '';
  const isTd = app.toString().toLowerCase().includes('td') || 
               app.toString().includes('タワー') || 
               app.toString().includes('tower');

  if (isTd) {
    const sheetName = '分数タワーディフェンス';
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(['名前', 'スコア', '到達ウェーブ', 'たおした数', '最大コンボ', '登録日時']);
      sheet.getRange(1, 1, 1, 6)
        .setBackground('#4F46E5')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 140);
      sheet.setColumnWidth(2, 100);
      sheet.setColumnWidth(3, 110);
      sheet.setColumnWidth(4, 110);
      sheet.setColumnWidth(5, 110);
      sheet.setColumnWidth(6, 160);

      // 初期サンプルデータ（空の場合のみ）
      const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
      sheet.appendRow(['まどうマスター', 3800, 'ウェーブ 6', 24, 12, now]);
      sheet.appendRow(['すうじの勇者', 2500, 'ウェーブ 4', 15, 8, now]);
      sheet.appendRow(['みならい魔法使い', 1200, 'ウェーブ 2', 7, 4, now]);
    }
    return { sheet: sheet, isTd: true };
  }

  // 既存の通分マスター（Scoresシート）との100%後方互換
  let sheet = ss.getSheetByName('Scores');
  if (!sheet) {
    sheet = ss.insertSheet('Scores');
    sheet.appendRow(['名前', 'スコア', '通分正解数', '登録日時']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return { sheet: sheet, isTd: false };
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const target = getTargetSheet(params);
    const sheet = target.sheet;
    const isTd = target.isTd;

    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return createJsonResponse([]);
    }

    const rows = data.slice(1);
    let records;

    if (isTd) {
      // 分数タワーディフェンス: [名前, スコア, 到達ウェーブ, たおした数, 最大コンボ, 登録日時]
      records = rows
        .filter(function(r) { return r[0] || r[1]; })
        .map(function(r) {
          return {
            name: String(r[0] || 'ななし'),
            score: Number(r[1]) || 0,
            wave: String(r[2] || 'ウェーブ 1'),
            defeated: Number(r[3]) || 0,
            combo: Number(r[4]) || 0,
            date: String(r[5] || '')
          };
        });
      // スコア降順、同点なら討伐数降順
      records.sort(function(a, b) {
        return (b.score - a.score) || (b.defeated - a.defeated);
      });
    } else {
      // 既存の通分マスター: [名前, スコア, 通分正解数, 登録日時]
      records = rows
        .filter(function(r) { return r[0] || r[1]; })
        .map(function(r) {
          return {
            name: String(r[0] || 'ななし'),
            score: Number(r[1]) || 0,
            cleared: Number(r[2]) || 0,
            date: String(r[3] || '')
          };
        });
      records.sort(function(a, b) {
        return (b.score - a.score) || (b.cleared - a.cleared);
      });
    }

    return createJsonResponse(records.slice(0, 50));
  } catch (err) {
    return createJsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    let postData = {};
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      postData = e.parameter;
    }

    const target = getTargetSheet(postData);
    const sheet = target.sheet;
    const isTd = target.isTd;

    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

    const name = String(postData.name || 'ななし').slice(0, 12).trim();
    const score = Number(postData.score) || 0;

    if (isTd) {
      const wave = postData.wave ? (String(postData.wave).indexOf('ウェーブ') !== -1 ? String(postData.wave) : ('ウェーブ ' + postData.wave)) : 'ウェーブ 1';
      const defeated = Number(postData.defeated) || 0;
      const combo = Number(postData.combo) || 0;

      // UPSERT（同名プレイヤーは最高スコアで更新）
      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      if (lastRow > 1) {
        const names = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (let i = 0; i < names.length; i++) {
          if (names[i][0] === name) {
            foundRow = i + 2;
            const curScore = Number(names[i][1]) || 0;
            if (score >= curScore) {
              sheet.getRange(foundRow, 1, 1, 6).setValues([[name, score, wave, defeated, combo, dateStr]]);
            }
            break;
          }
        }
      }
      if (foundRow === -1) {
        sheet.appendRow([name, score, wave, defeated, combo, dateStr]);
      }

      return createJsonResponse({ status: 'ok', name: name, score: score, wave: wave, defeated: defeated, combo: combo });
    } else {
      // 既存の通分マスター
      const cleared = Number(postData.cleared) || 0;
      sheet.appendRow([name, score, cleared, dateStr]);
      return createJsonResponse({ status: 'ok', name: name, score: score, cleared: cleared });
    }
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.message });
  }
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
