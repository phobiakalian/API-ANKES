// src/detector.js

/**
 * Menganalisis teks untuk mendeteksi pola spam/gcast
 * @param {string} text - Pesan yang akan dianalisis
 * @param {number} threshold - Skor minimum untuk deteksi (0.0-1.0)
 * @param {boolean} expert - Mode sensitivitas tinggi
 * @param {string[]} blacklist - Daftar kata terlarang
 * @returns {Object} Hasil analisis {is_gcast, score, reason, action}
 */
function analyzeAsciiPattern(text, threshold = 0.65, expert = false, blacklist = []) {
    const trimmed = text?.trim();
    
    // Pesan terlalu pendek = bukan gcast
    if (!trimmed || trimmed.length < 15) {
      return { is_gcast: false, score: 0.0, reason: ["too_short"], action: "allow" };
    }
  
    // 1. CEK BLACKLIST KATA TERLARANG (Prioritas Tertinggi)
    const lowerText = trimmed.toLowerCase();
    for (const word of blacklist) {
      if (lowerText.includes(word.toLowerCase())) {
        return {
          is_gcast: true,
          score: 1.0,
          reason: [`blacklist:${word}`],
          action: "delete"
        };
      }
    }
  
    // 2. CEK LINK (Langsung Gcast)
    const urlPattern = /(https?:\/\/|t\.me\/|www\.)\S+/gi;
    if (urlPattern.test(trimmed)) {
      return {
        is_gcast: true,
        score: 1.0,
        reason: ["contains_link"],
        action: "delete"
      };
    }
  
    // 3. DETEKSI POLA ASCII (Fallback)
    const alnumCount = [...trimmed].filter(c => /[a-zA-Z0-9]/.test(c)).length;
    const nonAlnumRatio = 1 - (alnumCount / trimmed.length);
  
    const charCounts = {};
    for (const char of trimmed.toLowerCase()) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(charCounts)) / trimmed.length;
  
    const urls = trimmed.match(/(https?:\/\/|t\.me\/|@)\S+/gi) || [];
    const urlScore = Math.min(urls.length * 0.35, 1.0);
  
    const words = trimmed.split(/\s+/).filter(w => w.length > 2);
    let repetitionScore = 0.0;
    if (words.length > 10) {
      const uniqueWords = new Set(words.map(w => w.toLowerCase()));
      repetitionScore = 1 - (uniqueWords.size / words.length);
    }
  
    let score = (nonAlnumRatio * 0.35) + (maxFreq * 0.25) + (urlScore * 0.25) + (repetitionScore * 0.15);
    
    // Mode expert = lebih sensitif (threshold lebih rendah)
    if (expert) threshold *= 0.85;
  
    const isGcast = score >= threshold;
    
    // Kumpulkan alasan deteksi
    const reasons = [];
    if (nonAlnumRatio > 0.45) reasons.push("high_special_chars");
    if (maxFreq > 0.35) reasons.push("char_repetition");
    if (urls.length >= 2) reasons.push("multiple_links");
    if (repetitionScore > 0.5) reasons.push("text_duplication");
  
    return {
      is_gcast: isGcast,
      score: parseFloat(score.toFixed(3)),
      reason: reasons.length ? reasons : ["clean"],
      action: isGcast ? "delete" : "allow"
    };
  }
  
  module.exports = { analyzeAsciiPattern };