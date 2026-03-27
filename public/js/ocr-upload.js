document.addEventListener('alpine:init', () => {
  Alpine.data('ocrUpload', () => ({
    imageFiles: [],        // support multiple files
    imagePreviews: [],
    currentFileIndex: 0,
    recognizedWords: [],
    recognizeErrors: [],
    rawText: '',
    loading: false,
    loadingMsg: '',
    showResults: false,
    resultType: '',        // 'vocab_list' | 'freeform'
    aiEnriching: false,    // AI adding meanings

    onImageSelect(e) {
      const files = e.target.files || e.dataTransfer?.files;
      if (!files || !files.length) return;
      this.imageFiles = [];
      this.imagePreviews = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) continue;
        this.imageFiles.push(file);
        const reader = new FileReader();
        reader.onload = (ev) => { this.imagePreviews.push(ev.target.result); };
        reader.readAsDataURL(file);
      }
    },

    async _compressImage(file) {
      if (file.size < 500 * 1024) return file;
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1200;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.85);
        };
        img.src = URL.createObjectURL(file);
      });
    },

    async recognize() {
      if (!this.imageFiles.length) return;
      this.loading = true;
      this.recognizedWords = [];
      this.recognizeErrors = [];
      this.resultType = '';

      for (let i = 0; i < this.imageFiles.length; i++) {
        this.currentFileIndex = i;
        this.loadingMsg = this.imageFiles.length > 1
          ? `正在识别第 ${i + 1}/${this.imageFiles.length} 张图片...`
          : '正在压缩图片...';

        try {
          const compressed = await this._compressImage(this.imageFiles[i]);
          this.loadingMsg = this.imageFiles.length > 1
            ? `正在识别第 ${i + 1}/${this.imageFiles.length} 张...`
            : '正在识别中，大图可能需要 30-60 秒...';

          const fd = new FormData();
          fd.append('image', compressed);
          const res = await fetch('/api/ocr/recognize', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${API.token}` },
            body: fd,
          });
          const data = await res.json();

          if (data.words) {
            // Deduplicate with existing recognized words
            const existingSet = new Set(this.recognizedWords.map(w => w.word.toLowerCase()));
            for (const w of data.words) {
              if (!existingSet.has(w.word.toLowerCase())) {
                this.recognizedWords.push(w);
                existingSet.add(w.word.toLowerCase());
              }
            }
          }
          if (data.errors) {
            this.recognizeErrors.push(...data.errors);
          }
          if (data.type) {
            // Use the last non-empty type (freeform takes priority)
            if (data.type === 'freeform' || !this.resultType) {
              this.resultType = data.type;
            }
          }
          if (data.rawText) {
            this.rawText += (this.rawText ? '\n---\n' : '') + data.rawText;
          }
        } catch (e) {
          this.recognizeErrors.push(`图片 ${i + 1}: ${e.message}`);
        }
      }

      this.showResults = true;
      this.loading = false;

      if (this.recognizedWords.length > 0) {
        const hasEmptyMeaning = this.recognizedWords.some(w => !w.meaning);
        if (this.resultType === 'freeform' || hasEmptyMeaning) {
          this.$dispatch('toast', {
            message: `识别到 ${this.recognizedWords.length} 个英文单词，可使用 AI 补充词义`,
            type: 'info'
          });
        } else {
          this.$dispatch('toast', {
            message: `成功识别 ${this.recognizedWords.length} 个单词`,
            type: 'success'
          });
        }
      }
    },

    // AI enrich: fill in meanings for words without them
    async aiEnrichMeanings() {
      const wordsToEnrich = this.recognizedWords.filter(w => !w.meaning);
      if (!wordsToEnrich.length) {
        this.$dispatch('toast', { message: '所有单词都已有释义', type: 'info' });
        return;
      }
      this.aiEnriching = true;
      try {
        const wordList = wordsToEnrich.map(w => w.word).join(', ');
        const res = await fetch('/api/ocr/enrich', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ words: wordsToEnrich.map(w => w.word) }),
        });
        const data = await res.json();
        if (data.words) {
          // Merge meanings back
          const meaningMap = {};
          for (const w of data.words) {
            meaningMap[w.word.toLowerCase()] = w;
          }
          for (let i = 0; i < this.recognizedWords.length; i++) {
            const enriched = meaningMap[this.recognizedWords[i].word.toLowerCase()];
            if (enriched) {
              if (enriched.meaning && !this.recognizedWords[i].meaning) {
                this.recognizedWords[i].meaning = enriched.meaning;
              }
              if (enriched.phonetic && !this.recognizedWords[i].phonetic) {
                this.recognizedWords[i].phonetic = enriched.phonetic;
              }
            }
          }
          this.$dispatch('toast', {
            message: `已为 ${data.words.length} 个单词补充词义`,
            type: 'success'
          });
        }
      } catch (e) {
        this.$dispatch('toast', { message: 'AI 补充失败: ' + e.message, type: 'error' });
      }
      this.aiEnriching = false;
    },

    get hasEmptyMeanings() {
      return this.recognizedWords.some(w => !w.meaning);
    },

    removeWord(index) {
      this.recognizedWords.splice(index, 1);
    },

    async saveWords() {
      if (!this.recognizedWords.length) return;
      try {
        const result = await API.addWordsBatch(this.recognizedWords);
        this.$dispatch('toast', {
          message: `已添加 ${result.inserted} 个单词${result.skipped ? '，跳过 ' + result.skipped + ' 个重复' : ''}`,
          type: 'success'
        });
        this.reset();
        this.$dispatch('vocab-refresh');
      } catch (e) {
        this.$dispatch('toast', { message: e.message, type: 'error' });
      }
    },

    reset() {
      this.imageFiles = [];
      this.imagePreviews = [];
      this.currentFileIndex = 0;
      this.recognizedWords = [];
      this.recognizeErrors = [];
      this.rawText = '';
      this.showResults = false;
      this.resultType = '';
    },
  }));
});
