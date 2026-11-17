import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
  TextInput,
  Alert,
} from "react-native";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// Idiomas de Destino para Traducir Palabras o Frases Seleccionadas
// ============================================================================
const TARGET_LANGUAGES = [
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
];

export interface WordToken {
  surface: string;
  reading: string;
  base_form: string;
  pos: string;
  meaning: string;
  grammar_note?: string;
}

export interface SpeechBubble {
  id: string;
  box: { x: number; y: number; w: number; h: number };
  original_text: string;
  translated_text: string;
  words: WordToken[];
}

export interfaceSavedCard {
  key: string;
  type: string;
  surface: string;
  reading: string;
  meaning: string;
  targetLangName: string;
  sourceLang: string;
  breakdown: string;
  sentence: string;
  sentenceTranslation: string;
}

const DEMO_CHAPTERS: Record<string, any> = {
  ja: {
    id: "ja",
    flag: "🇯🇵",
    langName: "Japonés",
    ttsLang: "ja-JP",
    source_language: "ja",
    title: "Encuentro en Shibuya",
    bubbles: [
      {
        id: "ja-b1",
        box: { x: 0.48, y: 0.04, w: 0.48, h: 0.24 },
        original_text: "今日は本当にいい天気ですね！",
        translated_text: "¡Hoy hace un tiempo realmente bueno, ¿verdad?!",
        words: [
          { surface: "今日", reading: "きょう", base_form: "今日", pos: "Sustantivo", meaning: "hoy", grammar_note: "Lectura especial kyō." },
          { surface: "は", reading: "wa", base_form: "は", pos: "Partícula", meaning: "respecto a", grammar_note: "Marca el tema." },
          { surface: "本当に", reading: "ほんとうに", base_form: "本当", pos: "Adverbio", meaning: "realmente", grammar_note: "Adverbio de énfasis." },
          { surface: "いい", reading: "ii", base_form: "良い", pos: "Adjetivo", meaning: "bueno", grammar_note: "Adjetivo -i." },
          { surface: "天気", reading: "てんき", base_form: "天気", pos: "Sustantivo", meaning: "clima", grammar_note: "天 (cielo) + 気 (energía)." },
          { surface: "ですね", reading: "desu ne", base_form: "だ+ね", pos: "Expresión", meaning: "¿verdad?", grammar_note: "Confirmación cortés." },
        ],
      },
      {
        id: "ja-b2",
        box: { x: 0.08, y: 0.36, w: 0.84, h: 0.24 },
        original_text: "はい、毎日少しずつ読んでいます。",
        translated_text: "Sí, lo estoy leyendo poco a poco todos los días.",
        words: [
          { surface: "はい", reading: "hai", base_form: "はい", pos: "Interjección", meaning: "sí", grammar_note: "Afirmación formal." },
          { surface: "毎日", reading: "まいにち", base_form: "毎日", pos: "Adverbio", meaning: "cada día", grammar_note: "Todos los días." },
          { surface: "少しずつ", reading: "すこしずつ", base_form: "少し+ずつ", pos: "Adverbio", meaning: "poco a poco", grammar_note: "Gradualmente." },
          { surface: "読んで", reading: "よんで", base_form: "読む", pos: "Verbo", meaning: "leyendo", grammar_note: "Forma -te de leer." },
          { surface: "います", reading: "imasu", base_form: "いる", pos: "Auxiliar", meaning: "estoy haciendo", grammar_note: "Acción continua." },
        ],
      },
      {
        id: "ja-b3",
        box: { x: 0.12, y: 0.68, w: 0.78, h: 0.24 },
        original_text: "一緒に新しい言葉を勉強しよう！",
        translated_text: "¡Estudiemos nuevas palabras juntos!",
        words: [
          { surface: "一緒に", reading: "いっしょに", base_form: "一緒", pos: "Adverbio", meaning: "juntos", grammar_note: "En compañía." },
          { surface: "新しい", reading: "あたらしい", base_form: "新しい", pos: "Adjetivo", meaning: "nuevas", grammar_note: "Califica a 言葉." },
          { surface: "言葉", reading: "ことば", base_form: "言葉", pos: "Sustantivo", meaning: "palabras", grammar_note: "Vocabulario o idioma." },
          { surface: "を", reading: "o", base_form: "を", pos: "Partícula", meaning: "(objeto)", grammar_note: "Objeto directo." },
          { surface: "勉強しよう", reading: "べんきょうしよう", base_form: "勉強する", pos: "Verbo", meaning: "¡estudiemos!", grammar_note: "Forma volitiva." },
        ],
      },
    ],
  },
  ko: {
    id: "ko",
    flag: "🇰🇷",
    langName: "Coreano",
    ttsLang: "ko-KR",
    source_language: "ko",
    title: "Noche en Seúl (Manhwa)",
    bubbles: [
      {
        id: "ko-b1",
        box: { x: 0.35, y: 0.05, w: 0.60, h: 0.24 },
        original_text: "오늘 날씨가 정말 좋네요!",
        translated_text: "¡El clima de hoy está realmente bueno!",
        words: [
          { surface: "오늘", reading: "oneul", base_form: "오늘", pos: "Sustantivo", meaning: "hoy" },
          { surface: "날씨가", reading: "nalssi-ga", base_form: "날씨+가", pos: "Sustantivo", meaning: "el clima" },
          { surface: "정말", reading: "jeongmal", base_form: "정말", pos: "Adverbio", meaning: "realmente" },
          { surface: "좋네요", reading: "jonneyo", base_form: "좋다", pos: "Adjetivo", meaning: "¡está muy bueno!" },
        ],
      },
      {
        id: "ko-b2",
        box: { x: 0.14, y: 0.66, w: 0.74, h: 0.24 },
        original_text: "우리 같이 천천히 읽어 볼까요?",
        translated_text: "¿Intentamos leerlo juntos poco a poco?",
        words: [
          { surface: "우리", reading: "uri", base_form: "우리", pos: "Pronombre", meaning: "nosotros" },
          { surface: "같이", reading: "gachi", base_form: "같이", pos: "Adverbio", meaning: "juntos" },
          { surface: "천천히", reading: "cheoncheonhi", base_form: "천천히", pos: "Adverbio", meaning: "despacio" },
          { surface: "읽어", reading: "ilgeo", base_form: "읽다", pos: "Verbo", meaning: "leer" },
          { surface: "볼까요?", reading: "bolkkayo?", base_form: "보다", pos: "Auxiliar", meaning: "¿probamos?" },
        ],
      },
    ],
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"reader" | "anki" | "import">("reader");
  const [chapterKey, setChapterKey] = useState<string>("ja");
  const [targetLang, setTargetLang] = useState<string>("es");
  const [displayMode, setDisplayMode] = useState<"original" | "translated" | "bilingual">("original");
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);

  const currentChapter = DEMO_CHAPTERS[chapterKey] || DEMO_CHAPTERS.ja;
  const [selectedBubble, setSelectedBubble] = useState<SpeechBubble>(currentChapter.bubbles[0]);
  const [selectedWordIndices, setSelectedWordIndices] = useState<number[]>([0]);

  const [translatedSelection, setTranslatedSelection] = useState<string>("");
  const [translatedFullBubble, setTranslatedFullBubble] = useState<string>("");
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [backendUrl, setBackendUrl] = useState<string>("http://192.168.1.100:8000");
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");

  const targetLangObj = TARGET_LANGUAGES.find((l) => l.code === targetLang) || TARGET_LANGUAGES[0];

  const selectedWords = (selectedBubble?.words || []).filter((_, idx) =>
    selectedWordIndices.includes(idx)
  );
  const isPhrase = selectedWords.length > 1;
  const surfaceText = selectedWords.map((w) => w.surface).join(chapterKey === "ja" ? "" : " ");
  const readingText = selectedWords.map((w) => w.reading).join(" · ");

  // Traduce dinámicamente la palabra o frase seleccionada al idioma elegido
  useEffect(() => {
    let active = true;
    async function runTranslation() {
      if (!selectedBubble || selectedWords.length === 0) return;
      if (targetLang === "es" && !isPhrase) {
        setTranslatedSelection(selectedWords[0].meaning);
        setTranslatedFullBubble(selectedBubble.translated_text);
        return;
      }
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${currentChapter.source_language}&tl=${targetLang}&dt=t&q=${encodeURIComponent(surfaceText)}`;
        const res = await fetch(url);
        const data = await res.json();
        const trans = (data[0] || []).map((s: any) => s[0]).join("");

        const urlFull = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${currentChapter.source_language}&tl=${targetLang}&dt=t&q=${encodeURIComponent(selectedBubble.original_text)}`;
        const resFull = await fetch(urlFull);
        const dataFull = await resFull.json();
        const transFull = (dataFull[0] || []).map((s: any) => s[0]).join("");

        if (active) {
          setTranslatedSelection(trans || selectedWords.map((w) => w.meaning).join(" + "));
          setTranslatedFullBubble(transFull || selectedBubble.translated_text);
        }
      } catch {
        if (active) {
          setTranslatedSelection(selectedWords.map((w) => w.meaning).join(" + "));
          setTranslatedFullBubble(selectedBubble.translated_text);
        }
      }
    }
    runTranslation();
    return () => {
      active = false;
    };
  }, [selectedBubble, selectedWordIndices, targetLang, chapterKey]);

  const handleTapWord = (bubble: SpeechBubble, idx: number) => {
    if (selectedBubble.id !== bubble.id) {
      setSelectedBubble(bubble);
      setSelectedWordIndices([idx]);
      return;
    }
    if (multiSelectMode) {
      setSelectedWordIndices((prev) => {
        const exists = prev.includes(idx);
        const next = exists ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b);
        return next.length > 0 ? next : [idx];
      });
    } else {
      setSelectedWordIndices([idx]);
    }
  };

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: currentChapter.ttsLang || "ja-JP", rate: 0.92 });
  };

  const saveToAnkiList = () => {
    const key = `${surfaceText}__${targetLang}`;
    const exists = savedCards.some((c) => c.key === key);
    if (exists) {
      setSavedCards(savedCards.filter((c) => c.key !== key));
    } else {
      setSavedCards([
        {
          key,
          type: isPhrase ? `Frase (${selectedWords.length} palabras)` : selectedWords[0]?.pos || "Palabra",
          surface: surfaceText,
          reading: readingText,
          meaning: translatedSelection,
          targetLangName: `${targetLangObj.flag} ${targetLangObj.name}`,
          sentence: selectedBubble.original_text,
          sentenceTranslation: translatedFullBubble,
        },
        ...savedCards,
      ]);
    }
  };

  // Exporta y abre el menú nativo del celular para enviar directo a AnkiDroid / AnkiMobile
  const exportAnkiToPhone = async () => {
    if (savedCards.length === 0) return;
    const headers = [
      "#separator:tab",
      "#html:true",
      "#deck:MangaGlot_Celular",
      "#columns:Front\tBack\tReading\tContextSentence\tContextTranslation",
    ];
    const rows = savedCards.map(
      (c) => `${c.surface}\t${c.meaning} (${c.targetLangName})\t${c.reading}\t${c.sentence}\t${c.sentenceTranslation}`
    );
    const content = [...headers, ...rows].join("\n");
    const fileUri = FileSystem.documentDirectory + "MangaGlot_Anki.txt";
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/plain",
        dialogTitle: "Importar mazo en AnkiDroid / Anki",
      });
    } else {
      Alert.alert("Archivo guardado", `Guardado en: ${fileUri}`);
    }
  };

  const pickMangaImageFromPhone = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      Alert.alert("Imagen cargada", "Enviando al motor híbrido Gemini + OCR...");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* CABECERA MÓVIL */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>語</Text>
          </View>
          <View>
            <Text style={styles.appTitle}>MangaGlot Mobile</Text>
            <Text style={styles.appSubtitle}>Toca 1 o varias palabras • Exporta a AnkiDroid</Text>
          </View>
        </View>

        {/* Selector horizontal de idioma de traducción */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langBar}>
          <Text style={styles.langLabel}>🌍 Traducir a:</Text>
          {TARGET_LANGUAGES.map((l) => (
            <TouchableOpacity
              key={l.code}
              onPress={() => setTargetLang(l.code)}
              style={[styles.langPill, targetLang === l.code && styles.langPillActive]}
            >
              <Text style={styles.langPillText}>
                {l.flag} {l.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* CONTENIDO PRINCIPAL */}
      <ScrollView contentContainerStyle={styles.scrollBody}>
        {activeTab === "reader" && (
          <>
            {/* Controles Táctiles de Celular */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={() => setMultiSelectMode(!multiSelectMode)}
                style={[styles.multiBtn, multiSelectMode && styles.multiBtnActive]}
              >
                <Text style={styles.multiBtnText}>
                  👆 {multiSelectMode ? "Uniendo Frase (Activo)" : "Seleccionar Varias Palabras"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  setDisplayMode(displayMode === "original" ? "translated" : "original")
                }
                style={styles.modeBtn}
              >
                <Text style={styles.modeBtnText}>
                  {displayMode === "original" ? "🔄 Traducir Globo" : "🈶 Ver Original"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* BORDE SUPERIOR DE ANIME */}
            <View style={styles.animeBorderBanner}>
              <Text style={styles.animeBannerLeft}>⚔️ 侍 SAMURAI • マンガ学習</Text>
              <Text style={styles.animeBannerRight}>「諦めない！」 • 忍 NINJA</Text>
            </View>

            {/* MARCO DEL MANGA CON BORDES LATERALES ANIME */}
            <View style={styles.mangaOuterFrame}>
              <View style={styles.mangaCanvas}>
                {currentChapter.bubbles.map((b: SpeechBubble, bIdx: number) => {
                  const isActive = b.id === selectedBubble.id;
                  return (
                    <View
                      key={b.id}
                      style={[
                        styles.bubbleBox,
                        {
                          left: `${b.box.x * 100}%`,
                          top: `${b.box.y * 100}%`,
                          width: `${b.box.w * 100}%`,
                        },
                        isActive && styles.bubbleBoxActive,
                      ]}
                    >
                      <View style={styles.bubbleHeader}>
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedBubble(b);
                            setSelectedWordIndices(b.words.map((_, i) => i));
                          }}
                        >
                          <Text style={styles.bubbleTag}>Frase #{bIdx + 1} (Todo)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => speak(b.original_text)}>
                          <Text style={styles.audioTag}>🔊</Text>
                        </TouchableOpacity>
                      </View>

                      {displayMode === "translated" ? (
                        <Text style={styles.translatedBubbleText}>{translatedFullBubble}</Text>
                      ) : (
                        <View style={styles.wordsWrap}>
                          {b.words.map((w, wIdx) => {
                            const selected = isActive && selectedWordIndices.includes(wIdx);
                            return (
                              <TouchableOpacity
                                key={wIdx}
                                onPress={() => handleTapWord(b, wIdx)}
                                style={[styles.wordChip, selected && styles.wordChipSelected]}
                              >
                                <Text style={[styles.readingSmall, selected && { color: "#ffe4e6" }]}>
                                  {w.reading}
                                </Text>
                                <Text style={[styles.surfaceText, selected && { color: "#ffffff" }]}>
                                  {w.surface}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* BORDE INFERIOR DE ANIME */}
            <View style={styles.animeBorderBannerBottom}>
              <Text style={styles.animeBannerLeft}>🐉 竜 DRAGON • MODO LECTURA</Text>
              <Text style={styles.animeBannerRight}>Tarjetas Anki: {savedCards.length}</Text>
            </View>
          </>
        )}

        {activeTab === "anki" && (
          <View style={styles.ankiSection}>
            <TouchableOpacity onPress={exportAnkiToPhone} style={styles.exportAnkiBtn}>
              <Text style={styles.exportAnkiBtnText}>
                📥 Exportar a AnkiDroid / AnkiMobile ({savedCards.length})
              </Text>
            </TouchableOpacity>
            {savedCards.map((c, i) => (
              <View key={i} style={styles.savedCard}>
                <Text style={styles.savedType}>{c.type} → {c.targetLangName}</Text>
                <Text style={styles.savedSurface}>{c.surface} ({c.reading})</Text>
                <Text style={styles.savedMeaning}>{c.meaning}</Text>
                <Text style={styles.savedSentence}>{c.sentence}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === "import" && (
          <View style={styles.ankiSection}>
            <TouchableOpacity onPress={pickMangaImageFromPhone} style={styles.exportAnkiBtn}>
              <Text style={styles.exportAnkiBtnText}>📂 Subir Página de Manga de mi Galería</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* PANEL INFERIOR TÁCTIL (BOTTOM SHEET DE TRADUCCIÓN Y ANKI) */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetReading}>{readingText}</Text>
            <Text style={styles.sheetSurface}>{surfaceText}</Text>
          </View>
          <TouchableOpacity onPress={() => speak(surfaceText)} style={styles.ttsButton}>
            <Text style={{ color: "#fff", fontWeight: "bold" }}>🔊 Audio</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sheetMeaning}>
          {targetLangObj.flag} {translatedSelection}
        </Text>
        <Text style={styles.sheetContext}>Globo: “{translatedFullBubble}”</Text>

        <View style={styles.sheetActions}>
          <TouchableOpacity onPress={saveToAnkiList} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>
              ☆ Guardar {isPhrase ? "Frase" : "Palabra"} para Anki
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab(activeTab === "reader" ? "anki" : "reader")}
            style={styles.tabSwitchBtn}
          >
            <Text style={styles.tabSwitchText}>
              {activeTab === "reader" ? `⭐ Anki (${savedCards.length})` : "📖 Volver al Lector"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#070a12" },
  header: { backgroundColor: "#0f172a", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#1e293b" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  logoBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#e11d48", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 18 },
  appTitle: { color: "#f8fafc", fontWeight: "800", fontSize: 16 },
  appSubtitle: { color: "#94a3b8", fontSize: 12 },
  langBar: { flexDirection: "row", marginTop: 2 },
  langLabel: { color: "#818cf8", fontWeight: "700", fontSize: 12, alignSelf: "center", marginRight: 8 },
  langPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#1e293b", marginRight: 6 },
  langPillActive: { backgroundColor: "#4f46e5" },
  langPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  scrollBody: { padding: 12, paddingBottom: 230 },
  controlsRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  multiBtn: { flex: 1, backgroundColor: "#1e293b", paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: "#334155" },
  multiBtnActive: { backgroundColor: "#c026d3", borderColor: "#f0abfc" },
  multiBtnText: { color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center" },
  modeBtn: { backgroundColor: "#059669", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  modeBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  animeBorderBanner: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#881337", paddingHorizontal: 12, paddingVertical: 6, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderColor: "#f43f5e" },
  animeBorderBannerBottom: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1e1b4b", paddingHorizontal: 12, paddingVertical: 6, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderWidth: 1, borderColor: "#6366f1" },
  animeBannerLeft: { color: "#fda4af", fontWeight: "900", fontSize: 12 },
  animeBannerRight: { color: "#fde047", fontWeight: "800", fontSize: 12 },
  mangaOuterFrame: { borderLeftWidth: 6, borderRightWidth: 6, borderColor: "#e11d48", backgroundColor: "#0f172a" },
  mangaCanvas: { width: "100%", height: 470, backgroundColor: "#1e293b", position: "relative" },
  bubbleBox: { position: "absolute", backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 14, padding: 8, elevation: 6 },
  bubbleBoxActive: { borderWidth: 3, borderColor: "#e11d48" },
  bubbleHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bubbleTag: { backgroundColor: "#0f172a", color: "#fff", fontSize: 12, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  audioTag: { fontSize: 13 },
  wordsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center" },
  wordChip: { backgroundColor: "#f1f5f9", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center" },
  wordChipSelected: { backgroundColor: "#e11d48", borderColor: "#9f1239" },
  readingSmall: { fontSize: 12, color: "#64748b" },
  surfaceText: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  translatedBubbleText: { fontSize: 13, fontWeight: "800", color: "#0f172a", textAlign: "center", paddingVertical: 6 },
  bottomSheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#0f172a", borderTopWidth: 2, borderColor: "#e11d48", padding: 14 },
  sheetTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetReading: { color: "#fb7185", fontSize: 12, fontWeight: "700" },
  sheetSurface: { color: "#fff", fontSize: 20, fontWeight: "900" },
  ttsButton: { backgroundColor: "#4f46e5", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  sheetMeaning: { color: "#34d399", fontSize: 16, fontWeight: "900", marginTop: 4 },
  sheetContext: { color: "#fde047", fontSize: 12, marginTop: 2 },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  saveBtn: { flex: 1, backgroundColor: "#e11d48", paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  tabSwitchBtn: { backgroundColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, justifyContent: "center" },
  tabSwitchText: { color: "#fde047", fontWeight: "800", fontSize: 12 },
  ankiSection: { gap: 10 },
  exportAnkiBtn: { backgroundColor: "#f59e0b", paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  exportAnkiBtnText: { color: "#090d16", fontWeight: "900", fontSize: 13 },
  savedCard: { backgroundColor: "#0f172a", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#1e293b" },
  savedType: { color: "#818cf8", fontSize: 12, fontWeight: "700" },
  savedSurface: { color: "#fff", fontSize: 18, fontWeight: "900" },
  savedMeaning: { color: "#34d399", fontSize: 15, fontWeight: "800" },
  savedSentence: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
});
