/**
 * SSY Excellent Homework Gallery
 * Alpine.js component: image gallery with admin upload/delete + lightbox
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('excellentTab', () => ({
    items: [],
    loading: false,
    uploading: false,
    newName: '',
    newNote: '',
    newImage: null,
    imagePreview: null,
    lightboxImage: null,
    lightboxName: '',

    async init() {
      await this.load();
    },

    async load() {
      this.loading = true;
      try {
        const data = await API.getExcellent();
        this.items = data.items || [];
      } catch (e) {
        this.items = [];
      }
      this.loading = false;
    },

    onImageSelect(event) {
      const file = event.target.files[0];
      if (!file) { this.newImage = null; this.imagePreview = null; return; }
      this.newImage = file;
      const reader = new FileReader();
      reader.onload = (e) => { this.imagePreview = e.target.result; };
      reader.readAsDataURL(file);
    },

    async upload() {
      if (!this.newName.trim()) {
        this.$dispatch('toast', { message: '请输入学生姓名', type: 'warning' });
        return;
      }
      this.uploading = true;
      try {
        const data = await API.addExcellent(this.newName.trim(), this.newImage, this.newNote.trim());
        this.items = data.items || [data.item, ...this.items];
        this.resetForm();
        this.$dispatch('toast', { message: '优秀作业已添加', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '上传失败', type: 'error' });
      }
      this.uploading = false;
    },

    resetForm() {
      this.newName = '';
      this.newNote = '';
      this.newImage = null;
      this.imagePreview = null;
      const input = this.$refs.imageInput;
      if (input) input.value = '';
    },

    async deleteItem(id) {
      if (!confirm('确定删除这条优秀作业？')) return;
      try {
        await API.deleteExcellent(id);
        this.items = this.items.filter(i => i.id !== id);
        this.$dispatch('toast', { message: '已删除', type: 'success' });
      } catch (e) {
        this.$dispatch('toast', { message: e.message || '删除失败', type: 'error' });
      }
    },

    openLightbox(item) {
      this.lightboxImage = item.image_path;
      this.lightboxName = item.student_name;
    },

    closeLightbox() {
      this.lightboxImage = null;
      this.lightboxName = '';
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const [, m, d] = dateStr.split('-');
      return `${parseInt(m)}月${parseInt(d)}日`;
    },
  }));
});
