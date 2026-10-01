<script setup lang="ts">
import { computed, onMounted, ref, toRef } from "vue";
import { useUiStore } from "../stores/ui";
import {
  audienceSuggestions,
  briefSteps,
  objectiveOptions,
  pillarOptions,
} from "../constants/contentOptions";
import AppIcon from "../components/ui/AppIcon.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseCheckbox from "../components/ui/BaseCheckbox.vue";
import BaseInput from "../components/ui/BaseInput.vue";
import BaseModal from "../components/ui/BaseModal.vue";
import BaseSelect from "../components/ui/BaseSelect.vue";
import BaseTextarea from "../components/ui/BaseTextarea.vue";
import InlineAlert from "../components/ui/InlineAlert.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import { useContentWorkflowStore } from "../stores/contentWorkflow";
import { useContentIdeasStore } from "../stores/contentIdeas";
import { useCompanyContextStore } from "../stores/companyContext";
import { useProductsStore } from "../stores/products";
import type { ContentIdea } from "../types/contentIdea";
import { useRouter } from "vue-router";
import ContentWorkflowStepper from "../components/content/ContentWorkflowStepper.vue";
import CreativeThumbnail from "../components/content/CreativeThumbnail.vue";
import BrandAssessmentCard from "../components/content/BrandAssessmentCard.vue";
import VisualDirectionCard from "../components/content/VisualDirectionCard.vue";
import { isBriefReady as isBriefReadyValue } from "../utils/contentValidation";
import * as creativeReferenceApi from "../api/creativeReferences";
import { createRequestKey, errorMessage } from "../api/client";
import type { BackendCreativeReference, BackendCreativeReferenceBatch, CreativeReferenceAspectRatio, CreativeReferenceMood, CreativeReferencePlatform, CreativeReferenceStyle } from "../types/backend";

const ui = useUiStore();
const router = useRouter();
const workflow = useContentWorkflowStore();
const ideas = useContentIdeasStore();
const companyContext = useCompanyContextStore();
const productsStore = useProductsStore();
const brief = workflow.brief;
const activeStep = toRef(workflow, "activeStep");
const isSaving = ref(false);
const savedAt = ref<string | null>(null);
const isEditingDraft = ref(false);
const generatedContent = workflow.generatedContent;
const visualDirection = workflow.visualDirection;
const enabledPlatforms = workflow.enabledPlatforms;
const isEditingInstagram = ref(false);
const isEditingLinkedIn = ref(false);
const designStatus = toRef(workflow, "designStatus");
const reuseInstagramCreative = toRef(workflow, "reuseInstagramCreative");
const instagramAssets = toRef(workflow, "instagramAssets");
const linkedInAssets = toRef(workflow, "linkedInAssets");
const creativeValidation = ref("");
const draggedInstagramAssetId = ref<string | null>(null);
const draggedLinkedInAssetId = ref<string | null>(null);
const isApproved = toRef(workflow, "isApproved");
const approvedBy = toRef(workflow, "approvedBy");
const approvedAt = toRef(workflow, "approvedAt");
const reviewValidation = ref("");
const reviewChecklist = workflow.reviewChecklist;
const reviewEditing = workflow.reviewEditing;
const reviewAssessments = workflow.reviewAssessments;
const reviewOverrides = workflow.reviewOverrides;
const overrideModalOpen = ref(false);
const overridePlatform = ref<"instagram" | "linkedin">("instagram");
const overrideJustification = ref("");
const overrideError = ref("");
const isScheduled = toRef(workflow, "isScheduled");
const scheduleValidation = ref("");
const creativeReferenceBatches = ref<BackendCreativeReferenceBatch[]>([]);
const creativeReferencePlatform = ref<CreativeReferencePlatform>("instagram");
const creativeReferenceStyle = ref<CreativeReferenceStyle>("modern_minimal");
const creativeReferenceMood = ref<CreativeReferenceMood>("professional");
const creativeReferenceAspectRatio = ref<CreativeReferenceAspectRatio>("portrait_4_5");
const creativeReferenceInstruction = ref("");
const creativeReferenceLoading = ref(false);
const creativeReferenceError = ref("");
const selectedCreativeReferenceId = ref<string | null>(null);
const useSameSchedule = toRef(workflow, "useSameSchedule");
const instagramSchedule = workflow.instagramSchedule;
const linkedInSchedule = workflow.linkedInSchedule;
const scheduledRecords = workflow.scheduledRecords;
const instagramContent = workflow.instagramContent;
const linkedInContent = workflow.linkedInContent;
const ARTIFACT_TIMEZONE = "Asia/Jakarta";
const productOptions = computed(() => productsStore.productOptions);

const selectedProduct = computed(() =>
  productsStore.getProduct(brief.product),
);
const topicLength = computed(() => brief.topic.length);
const selectedProductName = computed(
  () => selectedProduct.value?.name ?? "No product selected",
);
const resolvedProductContext = computed(() => brief.context === "product" ? productsStore.resolveProductContext(brief.product) : undefined);
const activeContextAudience = computed(() =>
  resolvedProductContext.value?.profile.targetUsers.length
    ? resolvedProductContext.value.profile.targetUsers.join(", ")
    : brief.context === "company" && companyContext.companyProfile.customerSegments.length
      ? companyContext.companyProfile.customerSegments.join(", ")
      : brief.audience || "Not set",
);
const activeContextName = computed(() => brief.context === "company" ? companyContext.companyProfile.name : selectedProductName.value);
const activeContextValue = computed(() => resolvedProductContext.value?.profile.valueProposition || (brief.context === "company" ? companyContext.companyProfile.coreValueProposition : "Select a product to resolve its value proposition."));
const activeBrandVoice = computed(() => resolvedProductContext.value?.resolvedBrandVoice || companyContext.brandProfile.brandVoice);
const selectedPillarLabel = computed(
  () =>
    pillarOptions.find((item) => item.value === brief.pillar)?.label ??
    "Educational",
);
const selectedObjectiveLabel = computed(
  () =>
    objectiveOptions.find((item) => item.value === brief.objective)?.label ??
    "Awareness",
);
const briefReadinessItems = computed(() => [
  { label: "Context", complete: Boolean(brief.context) },
  {
    label: "Product",
    complete: brief.context === "company" || Boolean(brief.product),
    optional: brief.context === "company",
  },
  { label: "Content Pillar", complete: Boolean(brief.pillar) },
  { label: "Objective", complete: Boolean(brief.objective) },
  { label: "Target Audience", complete: Boolean(brief.audience.trim()) },
  { label: "Topic", complete: Boolean(brief.topic.trim()) },
]);
const isBriefReady = computed(() => isBriefReadyValue(brief));
const generatedVariant = computed(() => ({
  ...generatedContent,
  label: generatedContent.title ? "Backend generation" : "Awaiting generation",
}));
const canContinueToCreative = computed(
  () => enabledPlatforms.instagram || enabledPlatforms.linkedin,
);
const creativeStatusOptions = [
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready", label: "Ready" },
];
const creativeStatusLabel = computed(
  () =>
    creativeStatusOptions.find((option) => option.value === designStatus.value)
      ?.label ?? "Not Started",
);
const creativeStatusTone = computed(() => {
  if (designStatus.value === "ready") return "success";
  if (designStatus.value === "in-progress") return "info";
  return "neutral";
});
const creativeReferencePlatformOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];
const creativeReferenceStyleOptions = [
  { value: "modern_minimal", label: "Modern minimal" },
  { value: "corporate", label: "Corporate" },
  { value: "editorial", label: "Editorial" },
  { value: "bold_typography", label: "Bold typography" },
  { value: "product_ui_focused", label: "Product UI focused" },
  { value: "abstract_technology", label: "Abstract technology" },
];
const creativeReferenceMoodOptions = [
  { value: "professional", label: "Professional" },
  { value: "confident", label: "Confident" },
  { value: "approachable", label: "Approachable" },
  { value: "innovative", label: "Innovative" },
  { value: "clean", label: "Clean" },
];
const creativeReferenceAspectRatioOptions = [
  { value: "portrait_4_5", label: "Portrait reference" },
  { value: "square_1_1", label: "Square reference" },
  { value: "landscape", label: "Landscape reference" },
];
const latestCreativeReferenceBatch = computed(() => creativeReferenceBatches.value.find((batch) => batch.platform === creativeReferencePlatform.value));
const selectedCreativeReference = computed(() => creativeReferenceBatches.value.flatMap((batch) => batch.references).find((reference) => reference.selected));
const missingCreativePlatforms = computed(() => {
  const missing: string[] = [];
  if (enabledPlatforms.instagram && instagramAssets.value.length === 0) {
    missing.push("Instagram");
  }
  if (
    enabledPlatforms.linkedin &&
    !reuseInstagramCreative.value &&
    linkedInAssets.value.length === 0
  ) {
    missing.push("LinkedIn");
  }
  if (
    enabledPlatforms.linkedin &&
    reuseInstagramCreative.value &&
    instagramAssets.value.length === 0
  ) {
    missing.push("LinkedIn");
  }
  return missing;
});
const canContinueToReview = computed(
  () => designStatus.value === "ready" && missingCreativePlatforms.value.length === 0,
);
const inheritedLinkedInAssets = computed(() =>
  reuseInstagramCreative.value ? instagramAssets.value : linkedInAssets.value,
);
const enabledReviewPlatforms = computed(() =>
  [
    enabledPlatforms.instagram ? "instagram" : null,
    enabledPlatforms.linkedin ? "linkedin" : null,
  ].filter((platform): platform is "instagram" | "linkedin" => Boolean(platform)),
);
const reviewChecklistComplete = computed(() =>
  Object.values(reviewChecklist).every(Boolean),
);
const reviewNeedsRecheck = computed(() =>
  enabledReviewPlatforms.value.some(
    (platform) => reviewAssessments[platform].state === "needs-recheck" || reviewAssessments[platform].checks.length === 0,
  ),
);
const platformsRequiringOverride = computed(() =>
  enabledReviewPlatforms.value.filter((platform) =>
    reviewAssessments[platform].status === "Needs Attention" || reviewAssessments[platform].checks.some((check) => check.status === "warning"),
  ),
);
const reviewOverridesComplete = computed(() =>
  platformsRequiringOverride.value.every((platform) => Boolean(reviewOverrides[platform].trim())),
);
const canApproveContent = computed(
  () =>
    canContinueToReview.value &&
    canContinueToCreative.value &&
    reviewChecklistComplete.value &&
    !reviewNeedsRecheck.value &&
    reviewOverridesComplete.value,
);
const approvedTimestampLabel = computed(
  () => approvedAt.value ?? "Not approved",
);
const schedulePlatformCount = computed(() => enabledReviewPlatforms.value.length);
const scheduleDateMinimum = computed(() => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARTIFACT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
});
const schedulePlatformRows = computed(() => [
  {
    id: "instagram" as const,
    label: "Instagram",
    copy: instagramContent.caption,
    assets: instagramAssets.value,
    schedule: instagramSchedule,
    record: scheduledRecords.instagram,
  },
  {
    id: "linkedin" as const,
    label: "LinkedIn",
    copy: linkedInContent.postCopy,
    assets: inheritedLinkedInAssets.value,
    schedule: linkedInSchedule,
    record: scheduledRecords.linkedin,
  },
]);
const recentIdeas = computed(() => ideas.recentReadyIdeas.slice(0, 2));

function choosePillar(value: string) {
  brief.pillar = value;
}

function chooseObjective(value: string) {
  brief.objective = value;
}

function applyRecentIdea(idea: ContentIdea) {
  workflow.startFromIdea(idea);
  savedAt.value = null;
  ui.notify(`Idea loaded: ${idea.title}`, "info");
}

async function regenerateContent() {
  if (workflow.loading) return;
  const generated = await workflow.generate();
  if (generated) {
    isEditingDraft.value = false;
    ui.notify("Content regenerated by the backend.", "success");
  }
}

function beginEditingDraft() {
  isEditingDraft.value = true;
  window.setTimeout(() => {
    document.getElementById("generated-title")?.focus();
  }, 0);
}

async function regenerateInstagram() {
  if (workflow.loading || !enabledPlatforms.instagram) return;
  const adapted = await workflow.adapt("instagram");
  if (adapted) {
    isEditingInstagram.value = false;
    ui.notify("Instagram adaptation refreshed.", "success");
  }
}

async function regenerateLinkedIn() {
  if (workflow.loading || !enabledPlatforms.linkedin) return;
  const adapted = await workflow.adapt("linkedin");
  if (adapted) {
    isEditingLinkedIn.value = false;
    ui.notify("LinkedIn adaptation refreshed.", "success");
  }
}

function beginEditingInstagram() {
  isEditingInstagram.value = true;
  window.setTimeout(() => {
    document.getElementById("instagram-caption")?.focus();
  }, 0);
}

function beginEditingLinkedIn() {
  isEditingLinkedIn.value = true;
  window.setTimeout(() => {
    document.getElementById("linkedin-post-copy")?.focus();
  }, 0);
}

function isSupportedCreative(file: File) {
  const allowedTypes = ["image/png", "image/jpeg"];
  const extension = file.name.split(".").pop()?.toLowerCase();
  return allowedTypes.includes(file.type) || ["png", "jpg", "jpeg"].includes(extension ?? "");
}

async function addCreativeFiles(files: FileList | File[], target: "instagram" | "linkedin") {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  const selected = Array.from(files).filter(isSupportedCreative);
  const assets = (await Promise.all(selected.map((file) => workflow.uploadCreative(file)))).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const rejectedCount = files.length - selected.length;
  const destination = target === "instagram" ? instagramAssets : linkedInAssets;
  destination.value.push(...assets);
  if (rejectedCount > 0) {
    creativeValidation.value = "Only PNG, JPG, and JPEG files can be added.";
  } else {
    creativeValidation.value = "";
  }
  if (assets.length > 0 && designStatus.value === "not-started") designStatus.value = "in-progress";
}

function handleCreativeInput(event: Event, target: "instagram" | "linkedin") {
  const input = event.target as HTMLInputElement;
  if (input.files) addCreativeFiles(input.files, target);
  input.value = "";
}

function handleCreativeDrop(event: DragEvent, target: "instagram" | "linkedin") {
  event.preventDefault();
  if (event.dataTransfer?.files) addCreativeFiles(event.dataTransfer.files, target);
}

function openCreativePicker(target: "instagram" | "linkedin") {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  document.getElementById(`${target}-file-input`)?.click();
}

function removeCreativeAsset(assetId: string, target: "instagram" | "linkedin") {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  const destination = target === "instagram" ? instagramAssets : linkedInAssets;
  const index = destination.value.findIndex((asset) => asset.id === assetId);
  if (index < 0) return;
  destination.value.splice(index, 1);
}

function moveCreativeAsset(
  target: "instagram" | "linkedin",
  fromId: string | null,
  toId: string,
) {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  if (!fromId || fromId === toId) return;
  const destination = target === "instagram" ? instagramAssets : linkedInAssets;
  const fromIndex = destination.value.findIndex((asset) => asset.id === fromId);
  const toIndex = destination.value.findIndex((asset) => asset.id === toId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = destination.value.splice(fromIndex, 1);
  destination.value.splice(toIndex, 0, moved);
}

function copyVisualBrief() {
  const visualBrief = [
    `Recommended Format: ${visualDirection.format}`,
    `Visual Concept: ${visualDirection.concept}`,
    `Slide Structure: ${visualDirection.structure.map((slide, index) => `${String(index + 1).padStart(2, "0")} — ${slide}`).join("; ")}`,
    `Visual Notes: ${visualDirection.notes}`,
  ].join("\n");
  if (!navigator.clipboard) {
    ui.notify("Visual brief is ready to copy manually.", "info");
    return;
  }
  navigator.clipboard
    .writeText(visualBrief)
    .then(() => ui.notify("Visual brief copied to clipboard.", "success"))
    .catch(() => ui.notify("Visual brief is ready to copy manually.", "info"));
}

async function loadCreativeReferences() {
  if (!workflow.contentId) return;
  try {
    const result = await creativeReferenceApi.listCreativeReferences(workflow.contentId);
    creativeReferenceBatches.value = result.data;
    const selected = result.data.flatMap((batch) => batch.references).find((reference) => reference.selected);
    selectedCreativeReferenceId.value = selected?.id ?? null;
  } catch (error) {
    creativeReferenceError.value = errorMessage(error, "Unable to load visual references.");
  }
}

async function generateCreativeReferences() {
  if (creativeReferenceLoading.value || !workflow.contentId || isApproved.value) return;
  if (creativeReferenceInstruction.value.trim().length > 500) {
    creativeReferenceError.value = "Additional visual instruction must be 500 characters or fewer.";
    return;
  }
  creativeReferenceLoading.value = true;
  creativeReferenceError.value = "";
  try {
    const result = await creativeReferenceApi.createCreativeReferences(workflow.contentId, {
      platform: creativeReferencePlatform.value,
      style: creativeReferenceStyle.value,
      mood: creativeReferenceMood.value,
      aspectRatio: creativeReferenceAspectRatio.value,
      additionalInstruction: creativeReferenceInstruction.value.trim() || null,
    }, createRequestKey("creative-references.create"));
    creativeReferenceBatches.value = [result.data.batch, ...creativeReferenceBatches.value];
    selectedCreativeReferenceId.value = result.data.batch.references.find((reference) => reference.selected)?.id ?? selectedCreativeReferenceId.value;
    ui.notify(result.data.batch.status === "partial" ? "Some visual references were generated." : "Three visual references are ready.", result.data.batch.status === "partial" ? "warning" : "success");
  } catch (error) {
    creativeReferenceError.value = errorMessage(error, "Unable to generate visual references.");
  } finally {
    creativeReferenceLoading.value = false;
  }
}

async function selectCreativeReference(reference: BackendCreativeReference) {
  if (!workflow.contentId || creativeReferenceLoading.value) return;
  try {
    const result = await creativeReferenceApi.selectCreativeReference(workflow.contentId, reference.id);
    creativeReferenceBatches.value = creativeReferenceBatches.value.map((batch) => batch.id === result.data.id ? result.data : batch);
    selectedCreativeReferenceId.value = reference.id;
    await loadCreativeReferences();
    ui.notify("Reference selected for Canva inspiration. Final creative upload is still required.", "success");
  } catch (error) {
    creativeReferenceError.value = errorMessage(error, "Unable to select this reference.");
  }
}

function copyDesignNotes(reference: BackendCreativeReference) {
  const notes = [`Concept: ${reference.conceptName}`, `Layout: ${reference.layoutNotes}`, `Visual focus: ${reference.visualFocus}`, `Typography direction: ${reference.typographyDirection}`].join("\n");
  if (!navigator.clipboard) {
    ui.notify("Design notes are ready to copy manually.", "info");
    return;
  }
  navigator.clipboard.writeText(notes).then(() => ui.notify("Design notes copied for Canva.", "success")).catch(() => ui.notify("Design notes are ready to copy manually.", "info"));
}

async function continueToReview() {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  if (!canContinueToReview.value) {
    creativeValidation.value = designStatus.value !== "ready"
      ? "Set Design Status to Ready after the required creative assets are uploaded."
      : `Add at least one creative asset for ${missingCreativePlatforms.value.join(" and ")} before marking the design Ready.`;
    return;
  }
  if (!workflow.contentId) {
    creativeValidation.value = "Create the Content brief before uploading creative assets.";
    return;
  }
  for (const platform of enabledReviewPlatforms.value) {
    if (platform === "instagram" || !reuseInstagramCreative.value) {
      const assets = platform === "instagram" ? instagramAssets.value : linkedInAssets.value;
      if (!(await workflow.attachCreative(platform, assets))) return;
    }
  }
  if (enabledPlatforms.linkedin && !(await workflow.setReuseCreative(reuseInstagramCreative.value))) return;
  if (!(await workflow.saveEditorial()) || !(await workflow.progress("ready_for_review"))) return;
  creativeValidation.value = "";
  activeStep.value = "review";
}

function markAssessmentNeedsRecheck(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it.";
    return;
  }
  reviewAssessments[platform].state = "needs-recheck";
  reviewOverrides[platform] = "";
  reviewValidation.value = "";
}

function editReviewPlatform(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it.";
    return;
  }
  reviewEditing[platform] = true;
}

async function recheckAlignment(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it."
    return
  }
  if (!(await workflow.saveVariant(platform))) return;
  const assessment = await workflow.brandCheck(platform);
  if (assessment) ui.notify(`${platform === "instagram" ? "Instagram" : "LinkedIn"} alignment checked by the backend.`, "success");
}

async function regenerateReviewPlatform(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it."
    return
  }
  if (platform === "instagram") await regenerateInstagram();
  else await regenerateLinkedIn();
  reviewEditing[platform] = false;
}

function openOverride(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it."
    return
  }
  overridePlatform.value = platform;
  overrideJustification.value = reviewOverrides[platform];
  overrideError.value = "";
  overrideModalOpen.value = true;
}

function guardApprovedEditing() {
  reviewValidation.value = "Approved Content is locked. Request a revision before editing it.";
  if (workflow.contentId) void router.push(`/content/${workflow.contentId}`);
}

function backFromReview() {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  activeStep.value = "creative";
}

async function confirmOverride() {
  const justification = overrideJustification.value.trim();
  if (!justification) {
    overrideError.value = "Justification is required before recording an override.";
    return;
  }
  const recorded = await workflow.override(overridePlatform.value, justification);
  if (!recorded) {
    overrideError.value = workflow.error || "Unable to record the override.";
    return;
  }
  reviewOverrides[overridePlatform.value] = justification;
  overrideModalOpen.value = false;
  overrideError.value = "";
  reviewValidation.value = "";
  ui.notify("Override recorded.", "success");
}

async function approveContent() {
  if (!canApproveContent.value) {
    reviewValidation.value = reviewNeedsRecheck.value
      ? "Re-check each edited or regenerated platform before approving."
      : !reviewChecklistComplete.value
        ? "Complete the Human Final Review checklist before approving."
        : !reviewOverridesComplete.value
          ? "Record a justification for each alignment warning before approving."
          : "Add the required creative assets before approving this content.";
    return;
  }
  const approved = await workflow.approve();
  if (!approved) {
    reviewValidation.value = workflow.error || "Unable to approve this Content.";
    return;
  }
  reviewValidation.value = "";
  ui.notify("Content approved by human review.", "success");
}

function updatePrimaryScheduleDate(value: string | number) {
  instagramSchedule.date = String(value);
  if (useSameSchedule.value) linkedInSchedule.date = instagramSchedule.date;
}

function updatePrimaryScheduleTime(value: string | number) {
  instagramSchedule.time = String(value);
  if (useSameSchedule.value) linkedInSchedule.time = instagramSchedule.time;
}

function updateScheduleDate(platform: "instagram" | "linkedin", value: string | number) {
  if (platform === "instagram") updatePrimaryScheduleDate(value);
  else linkedInSchedule.date = String(value);
}

function updateScheduleTime(platform: "instagram" | "linkedin", value: string | number) {
  if (platform === "instagram") updatePrimaryScheduleTime(value);
  else linkedInSchedule.time = String(value);
}

function syncScheduleMode() {
  if (useSameSchedule.value) {
    linkedInSchedule.date = instagramSchedule.date;
    linkedInSchedule.time = instagramSchedule.time;
  }
}

function scheduleDateTime(schedule: { date: string; time: string }) {
  return new Date(`${schedule.date}T${schedule.time}:00+07:00`);
}

function formatScheduleDate(date: string, time: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ARTIFACT_TIMEZONE,
  }).format(scheduleDateTime({ date, time }));
}

async function scheduleContent() {
  if (!isApproved.value) {
    scheduleValidation.value = "Approve the content in Review before scheduling.";
    return;
  }
  if (schedulePlatformCount.value === 0) {
    scheduleValidation.value = "Enable at least one platform in Adapt before scheduling.";
    return;
  }
  const schedules = enabledReviewPlatforms.value.map((platform) => ({
    platform,
    schedule: platform === "instagram" ? instagramSchedule : linkedInSchedule,
  }));
  const invalid = schedules.find(
    ({ schedule }) =>
      !schedule.date ||
      !schedule.time ||
      Number.isNaN(scheduleDateTime(schedule).getTime()) ||
      scheduleDateTime(schedule).getTime() <= Date.now(),
  );
  if (invalid) {
    scheduleValidation.value = `Choose a future publication date and time for ${invalid.platform === "instagram" ? "Instagram" : "LinkedIn"}.`;
    return;
  }
  const scheduled = await workflow.schedule();
  if (!scheduled) {
    scheduleValidation.value = workflow.error || "Unable to schedule this Content.";
    return;
  }
  scheduleValidation.value = "";
  ui.notify("Content scheduled for manual publication.", "success");
}

function resetWorkflow() {
  workflow.reset();
  savedAt.value = null;
  creativeValidation.value = "";
  reviewValidation.value = "";
  reviewEditing.instagram = false;
  reviewEditing.linkedin = false;
  overrideModalOpen.value = false;
  overrideJustification.value = "";
  overrideError.value = "";
  scheduleValidation.value = "";
  ui.notify("Started a new content workflow.", "info");
}

function continueToAdapt() {
  void (async () => {
    if (!(await workflow.saveEditorial())) return;
    let adapted = true;
    if (enabledPlatforms.instagram) adapted = Boolean(await workflow.adapt("instagram"));
    if (adapted && enabledPlatforms.linkedin) adapted = Boolean(await workflow.adapt("linkedin"));
    if (adapted) activeStep.value = "adapt";
  })();
}

async function continueToCreative() {
  if (enabledPlatforms.instagram && !(await workflow.saveVariant("instagram"))) return;
  if (enabledPlatforms.linkedin && !(await workflow.saveVariant("linkedin"))) return;
  if (!(await workflow.saveEditorial())) return;
  if (!(await workflow.progress("adapted"))) return;
  activeStep.value = "creative";
  await loadCreativeReferences();
}

function addAudience(suggestion: string) {
  const current = brief.audience.trim();
  if (!current.toLowerCase().includes(suggestion.toLowerCase())) {
    brief.audience = current ? `${current}, ${suggestion}` : suggestion;
  }
}

async function saveDraft() {
  if (isSaving.value) return;
  isSaving.value = true;
  const wasNew = !workflow.contentId;
  const saved = workflow.contentId ? await workflow.saveEditorial() : isBriefReady.value ? await workflow.createFromBrief() : undefined;
  if (saved) {
    if (wasNew && workflow.sourceIdeaId) await ideas.load(true);
    savedAt.value = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    ui.notify("Brief saved to the backend.", "success");
  }
  isSaving.value = false;
}

function cancelBrief() {
  workflow.startNewWorkflow();
  savedAt.value = null;
  void router.push("/");
}

async function continueToGenerate() {
  if (!isBriefReady.value) {
    ui.notify("Complete the required Brief fields before generating content.", "warning");
    return;
  }
  const created = await workflow.createFromBrief();
  if (!created) return;
  if (workflow.sourceIdeaId) await ideas.load(true);
  if (!(await workflow.generate())) return;
  activeStep.value = "generate";
  ui.notify("Content generated by the backend.", "success");
}

onMounted(() => {
  void Promise.all([ideas.load(), productsStore.load(), companyContext.load()]);
  if (workflow.contentId) void loadCreativeReferences();
});
</script>

<template>
  <div class="create-content-page">
    <header class="create-content-header">
      <div>
        <div class="app-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <span>Content</span
              ><AppIcon name="chevron-right" :size="12" /><span>Create</span
              ><AppIcon name="chevron-right" :size="12" /><span
                aria-current="page"
                >Step 1</span
              >
            </li>
          </ol>
        </div>
        <div class="create-content-title-row">
          <div>
            <h1 class="page-header__title">Create Content</h1>
            <p class="page-header__description">
              Translate strategic brand foundations and verified product
              knowledge into precision AI prompts.
            </p>
          </div>
          <StatusBadge tone="info" dot
            ><AppIcon name="system" :size="14" /> Context Engine: Backend context
            </StatusBadge
          >
        </div>
      </div>
    </header>

    <ContentWorkflowStepper :steps="briefSteps" :current="activeStep" />
    <InlineAlert v-if="workflow.loading" title="Working">Saving the canonical Content state…</InlineAlert>
    <InlineAlert v-else-if="workflow.error" title="Content action unavailable" tone="danger">{{ workflow.error }}</InlineAlert>

    <div v-if="activeStep === 'generate'" class="generate-workspace">
      <div class="generate-summary-bar">
        <div>
          <span class="brief-overline">Brief context</span>
          <strong>{{ selectedProductName }} · {{ selectedPillarLabel }} · {{ selectedObjectiveLabel }}</strong>
        </div>
        <div>
          <span class="brief-overline">Topic</span>
          <strong>{{ brief.topic }}</strong>
        </div>
        <StatusBadge tone="info" dot>{{ generatedVariant.label }}</StatusBadge>
      </div>

      <div class="generate-workbench">
        <section class="generate-draft-column">
          <BaseCard title="Content Draft" description="Edit the generated copy inline before adapting it for each platform.">
            <template #actions>
              <BaseButton
                variant="secondary"
                size="compact"
                :aria-pressed="isEditingDraft"
                @click="beginEditingDraft"
              >
                <AppIcon name="settings" :size="15" />{{ isEditingDraft ? "Editing" : "Edit" }}
              </BaseButton>
            </template>
            <div class="generated-fields" :class="{ 'is-editing': isEditingDraft }">
              <BaseInput id="generated-title" v-model="generatedContent.title" label="Title" />
              <BaseTextarea v-model="generatedContent.coreMessage" label="Core Message" :rows="2" />
              <BaseTextarea v-model="generatedContent.hook" label="Hook" :rows="2" />
              <BaseTextarea v-model="generatedContent.body" label="Body" :rows="7" />
              <BaseTextarea v-model="generatedContent.cta" label="CTA" :rows="2" />
            </div>
            <InlineAlert title="Backend generation" tone="info">
              This draft is generated from the selected Brief by the configured backend AI service.
            </InlineAlert>
          </BaseCard>

          <div class="generate-actions">
            <BaseButton variant="secondary" @click="regenerateContent">
              <AppIcon name="sparkles" :size="16" />Regenerate
            </BaseButton>
            <span class="generate-actions__hint">{{ generatedVariant.label }} · canonical Content response</span>
          </div>
        </section>

        <section class="generate-direction-column">
          <VisualDirectionCard :direction="visualDirection" />
        </section>
      </div>

      <div class="generate-footer">
        <BaseButton variant="ghost" @click="activeStep = 'brief'">
          <AppIcon name="arrow-left" :size="16" />Back to Brief
        </BaseButton>
        <BaseButton size="comfortable" @click="continueToAdapt">
          Continue to Platform Adaptation <AppIcon name="arrow-right" :size="17" />
        </BaseButton>
      </div>
    </div>

    <div v-else-if="activeStep === 'adapt'" class="adapt-workspace">
      <div class="adapt-context-bar">
        <div>
          <span class="brief-overline">Adapting master draft</span>
          <strong>{{ generatedContent.title }}</strong>
        </div>
        <span class="adapt-context-detail">{{ selectedProductName }} · {{ brief.audience }}</span>
      </div>

      <div class="platform-grid">
        <BaseCard title="Instagram" description="Concise, scannable copy for a carousel post.">
          <template #actions>
            <StatusBadge tone="info">Carousel</StatusBadge>
            <BaseCheckbox
              v-model="enabledPlatforms.instagram"
              label="Enabled"
              :disabled="!enabledPlatforms.linkedin"
              aria-label="Enable Instagram adaptation"
            />
          </template>
          <div class="platform-card-body" :class="{ 'is-disabled': !enabledPlatforms.instagram }">
            <div class="platform-card-toolbar">
              <span class="platform-label">Instagram variant</span>
              <BaseButton variant="ghost" size="compact" :aria-pressed="isEditingInstagram" @click="beginEditingInstagram">
                <AppIcon name="settings" :size="15" />{{ isEditingInstagram ? "Editing" : "Edit" }}
              </BaseButton>
            </div>
            <div class="adapt-fields">
              <BaseTextarea id="instagram-caption" v-model="instagramContent.caption" label="Caption" :rows="7" :disabled="!enabledPlatforms.instagram" />
              <BaseInput v-model="instagramContent.cta" label="CTA" :disabled="!enabledPlatforms.instagram" />
              <BaseTextarea v-model="instagramContent.hashtags" label="Suggested Hashtags" :rows="2" :disabled="!enabledPlatforms.instagram" />
              <BaseTextarea v-model="instagramContent.visualRecommendation" label="Visual Recommendation" :rows="4" :disabled="!enabledPlatforms.instagram" />
            </div>
            <BaseButton variant="secondary" :disabled="!enabledPlatforms.instagram" @click="regenerateInstagram">
              <AppIcon name="sparkles" :size="16" />Regenerate Instagram
            </BaseButton>
          </div>
        </BaseCard>

        <BaseCard title="LinkedIn" description="Contextual, professional copy for B2B decision-makers.">
          <template #actions>
            <StatusBadge tone="neutral">Thought leadership</StatusBadge>
            <BaseCheckbox
              v-model="enabledPlatforms.linkedin"
              label="Enabled"
              :disabled="!enabledPlatforms.instagram"
              aria-label="Enable LinkedIn adaptation"
            />
          </template>
          <div class="platform-card-body" :class="{ 'is-disabled': !enabledPlatforms.linkedin }">
            <div class="platform-card-toolbar">
              <span class="platform-label">LinkedIn variant</span>
              <BaseButton variant="ghost" size="compact" :aria-pressed="isEditingLinkedIn" @click="beginEditingLinkedIn">
                <AppIcon name="settings" :size="15" />{{ isEditingLinkedIn ? "Editing" : "Edit" }}
              </BaseButton>
            </div>
            <div class="adapt-fields">
              <BaseTextarea id="linkedin-post-copy" v-model="linkedInContent.postCopy" label="Post Copy" :rows="9" :disabled="!enabledPlatforms.linkedin" />
              <BaseInput v-model="linkedInContent.cta" label="CTA" :disabled="!enabledPlatforms.linkedin" />
              <BaseTextarea v-model="linkedInContent.hashtags" label="Suggested Hashtags" :rows="2" :disabled="!enabledPlatforms.linkedin" />
              <BaseTextarea v-model="linkedInContent.visualRecommendation" label="Visual Recommendation" :rows="4" :disabled="!enabledPlatforms.linkedin" />
            </div>
            <BaseButton variant="secondary" :disabled="!enabledPlatforms.linkedin" @click="regenerateLinkedIn">
              <AppIcon name="sparkles" :size="16" />Regenerate LinkedIn
            </BaseButton>
          </div>
        </BaseCard>
      </div>

      <InlineAlert v-if="!canContinueToCreative" title="Select at least one platform" tone="warning">
        Enable Instagram or LinkedIn before continuing to Creative.
      </InlineAlert>

      <div class="adapt-footer">
        <BaseButton variant="ghost" @click="activeStep = 'generate'">
          <AppIcon name="arrow-left" :size="16" />Back to Generate
        </BaseButton>
        <BaseButton size="comfortable" :disabled="!canContinueToCreative" @click="continueToCreative">
          Continue to Creative <AppIcon name="arrow-right" :size="17" />
        </BaseButton>
      </div>
    </div>

    <div v-else-if="activeStep === 'creative'" class="creative-workspace">
      <div class="creative-header-bar">
        <div>
          <span class="brief-overline">Creative production</span>
          <strong>Turn the visual direction into upload-ready assets.</strong>
        </div>
        <StatusBadge :tone="creativeStatusTone" dot>{{ creativeStatusLabel }}</StatusBadge>
      </div>

      <div class="creative-brief-grid">
        <VisualDirectionCard
          :direction="visualDirection"
          title="Visual Brief"
          description="The direction generated from your master content."
          copyable
          helper-title="External design tool"
          helper-text="Create your final visual using your preferred design tool, such as Canva, then upload the exported PNG/JPG files below."
          @copy="copyVisualBrief"
        />

        <BaseCard title="Design Status" description="Update this manually as the visual moves toward production.">
          <BaseSelect v-model="designStatus" label="Design status" :options="creativeStatusOptions" :disabled="isApproved" />
          <div class="creative-status-guide">
            <div :class="{ 'is-active': designStatus === 'not-started' }"><span>Not Started</span><small>No creative uploaded yet</small></div>
            <div :class="{ 'is-active': designStatus === 'in-progress' }"><span>In Progress</span><small>Assets are being prepared</small></div>
            <div :class="{ 'is-active': designStatus === 'ready' }"><span>Ready</span><small>Assets are ready for review</small></div>
          </div>
        </BaseCard>
      </div>

      <BaseCard title="AI Visual Reference" description="Generate visual concepts as design references before creating the final creative in Canva.">
        <div class="creative-reference-form">
          <BaseSelect v-model="creativeReferencePlatform" label="Platform" :options="creativeReferencePlatformOptions" />
          <BaseSelect v-model="creativeReferenceStyle" label="Style" :options="creativeReferenceStyleOptions" />
          <BaseSelect v-model="creativeReferenceMood" label="Mood" :options="creativeReferenceMoodOptions" />
          <BaseSelect v-model="creativeReferenceAspectRatio" label="Format" :options="creativeReferenceAspectRatioOptions" />
          <BaseTextarea v-model="creativeReferenceInstruction" label="Additional visual instruction (optional)" :rows="2" maxlength="500" placeholder="Keep the visual hierarchy calm and suitable for a B2B audience." />
        </div>
        <div class="creative-reference-actions">
          <div>
            <strong>References only</strong>
            <p>Generate 3 concepts and images with one explicit AI action. Use the selected inspiration to recreate the final design manually.</p>
          </div>
          <BaseButton size="comfortable" :loading="creativeReferenceLoading" :disabled="creativeReferenceLoading || !workflow.contentId || isApproved" @click="generateCreativeReferences">
            <AppIcon name="sparkles" :size="17" />Generate 3 References
          </BaseButton>
        </div>
        <InlineAlert v-if="creativeReferenceLoading" title="Generating visual concepts">Generating visual concepts and references...</InlineAlert>
        <InlineAlert v-if="creativeReferenceError" title="Visual reference" tone="warning">{{ creativeReferenceError }}</InlineAlert>
        <div v-if="latestCreativeReferenceBatch" class="creative-reference-results">
          <div class="creative-reference-batch-meta">
            <span>{{ latestCreativeReferenceBatch.status === "partial" ? "Partial batch" : "Latest reference batch" }}</span>
            <small>{{ latestCreativeReferenceBatch.actualGeneratedSize }} · {{ latestCreativeReferenceBatch.references.length }} of 3 available</small>
          </div>
          <div class="creative-reference-grid">
            <article v-for="reference in latestCreativeReferenceBatch.references" :key="reference.id" class="creative-reference-card" :class="{ 'is-selected': reference.selected || selectedCreativeReferenceId === reference.id }">
              <img :src="reference.imageUrl" :alt="`${reference.conceptName} visual reference`" class="creative-reference-image" />
              <div class="creative-reference-card-body">
                <div class="creative-reference-card-heading"><strong>{{ reference.conceptName }}</strong><StatusBadge v-if="reference.selected || selectedCreativeReferenceId === reference.id" tone="success">Selected Reference</StatusBadge></div>
                <dl class="creative-reference-notes">
                  <div><dt>Rationale</dt><dd>{{ reference.rationale }}</dd></div>
                  <div><dt>Layout</dt><dd>{{ reference.layoutNotes }}</dd></div>
                  <div><dt>Visual focus</dt><dd>{{ reference.visualFocus }}</dd></div>
                  <div><dt>Typography</dt><dd>{{ reference.typographyDirection }}</dd></div>
                </dl>
                <div class="creative-reference-card-actions">
                  <BaseButton size="compact" :disabled="reference.selected || selectedCreativeReferenceId === reference.id" @click="selectCreativeReference(reference)">{{ reference.selected || selectedCreativeReferenceId === reference.id ? "Selected" : "Select Reference" }}</BaseButton>
                  <BaseButton variant="ghost" size="compact" @click="copyDesignNotes(reference)">Copy Design Notes</BaseButton>
                </div>
              </div>
            </article>
          </div>
          <InlineAlert title="Keep the final creative separate" tone="info">Use this as inspiration in Canva. Upload your finished PNG/JPG design below; selecting a reference does not satisfy the final creative requirement.</InlineAlert>
          <p v-if="selectedCreativeReference" class="creative-reference-selected-note">Selected reference: <strong>{{ selectedCreativeReference.conceptName }}</strong>. The final uploaded creative remains the source used by Review.</p>
        </div>
      </BaseCard>

      <div class="creative-platform-grid">
        <BaseCard title="Instagram Creative" description="Upload one or more PNG/JPG files for the carousel.">
          <template #actions><StatusBadge tone="info">{{ instagramAssets.length }} {{ instagramAssets.length === 1 ? "asset" : "assets" }}</StatusBadge></template>
          <div class="creative-upload-stack">
            <div class="creative-dropzone" @dragover.prevent @drop="handleCreativeDrop($event, 'instagram')">
              <AppIcon name="upload" :size="22" />
              <strong>Drop PNG/JPG files here</strong>
              <span>or</span>
              <button type="button" class="brief-text-action" @click="openCreativePicker('instagram')">Browse files</button>
              <small>Multiple files supported for carousel content.</small>
              <input id="instagram-file-input" class="sr-only" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple @change="handleCreativeInput($event, 'instagram')" />
            </div>
            <div v-if="instagramAssets.length" class="creative-asset-grid" aria-label="Instagram creative order">
              <CreativeThumbnail
                v-for="(asset, index) in instagramAssets"
                :key="asset.id"
                :asset="asset"
                :index="index"
                @drag-start="draggedInstagramAssetId = $event"
                @drag-end="draggedInstagramAssetId = null"
                @drop="moveCreativeAsset('instagram', draggedInstagramAssetId, $event)"
                @remove="removeCreativeAsset($event, 'instagram')"
              />
            </div>
            <p v-else class="creative-empty-note">Your carousel previews will appear here in upload order.</p>
          </div>
        </BaseCard>

        <BaseCard title="LinkedIn Creative" description="Reuse the Instagram carousel or provide a separate asset.">
          <template #actions><StatusBadge tone="neutral">{{ reuseInstagramCreative ? "Inherited" : `${linkedInAssets.length} assets` }}</StatusBadge></template>
          <BaseCheckbox v-model="reuseInstagramCreative" label="Use the same creative as Instagram" :disabled="isApproved" />
          <div v-if="reuseInstagramCreative" class="inherited-creative-panel">
            <InlineAlert title="Instagram creative inherited" tone="info">
              LinkedIn will use the same authenticated creative assets unless you switch to a separate upload.
            </InlineAlert>
            <div v-if="inheritedLinkedInAssets.length" class="creative-asset-grid" aria-label="Inherited LinkedIn creative order">
              <CreativeThumbnail
                v-for="(asset, index) in inheritedLinkedInAssets"
                :key="asset.id"
                :asset="asset"
                :index="index"
                inherited
                :removable="false"
              />
            </div>
            <p v-else class="creative-empty-note">Upload Instagram creative to preview the inherited LinkedIn assets.</p>
          </div>
          <div v-else class="creative-upload-stack">
            <div class="creative-dropzone" @dragover.prevent @drop="handleCreativeDrop($event, 'linkedin')">
              <AppIcon name="upload" :size="22" />
              <strong>Drop a LinkedIn PNG/JPG here</strong>
              <span>or</span>
              <button type="button" class="brief-text-action" @click="openCreativePicker('linkedin')">Browse files</button>
              <small>Separate platform creative is stored as a private backend asset.</small>
              <input id="linkedin-file-input" class="sr-only" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple @change="handleCreativeInput($event, 'linkedin')" />
            </div>
            <div v-if="linkedInAssets.length" class="creative-asset-grid" aria-label="LinkedIn creative order">
              <CreativeThumbnail
                v-for="(asset, index) in linkedInAssets"
                :key="asset.id"
                :asset="asset"
                :index="index"
                @drag-start="draggedLinkedInAssetId = $event"
                @drag-end="draggedLinkedInAssetId = null"
                @drop="moveCreativeAsset('linkedin', draggedLinkedInAssetId, $event)"
                @remove="removeCreativeAsset($event, 'linkedin')"
              />
            </div>
            <p v-else class="creative-empty-note">Add a separate LinkedIn image when the inherited creative is disabled.</p>
          </div>
        </BaseCard>
      </div>

      <InlineAlert v-if="creativeValidation" title="Creative validation" tone="warning">
        {{ creativeValidation }}
      </InlineAlert>

      <div class="creative-footer">
        <BaseButton variant="ghost" @click="activeStep = 'adapt'"><AppIcon name="arrow-left" :size="16" />Back to Adapt</BaseButton>
        <BaseButton size="comfortable" @click="continueToReview">Continue to Review <AppIcon name="arrow-right" :size="17" /></BaseButton>
      </div>
    </div>

    <div v-else-if="activeStep === 'review'" class="review-workspace">
      <div class="review-header-bar">
        <div>
          <span class="brief-overline">Controlled approval workspace</span>
          <strong>Review copy, creative, and brand alignment before approval.</strong>
        </div>
        <StatusBadge :tone="isApproved ? 'success' : 'info'" dot>{{ isApproved ? "Approved" : "Human review required" }}</StatusBadge>
      </div>

      <section class="review-platform-grid">
        <BaseCard v-if="enabledPlatforms.instagram" title="Instagram" description="Final carousel copy and authenticated creative preview.">
          <template #actions><StatusBadge tone="info">Instagram</StatusBadge></template>
          <div class="review-platform-body">
            <div class="review-copy-fields">
              <div class="review-section-heading"><span class="brief-overline">Final Copy</span><BaseButton variant="ghost" size="compact" @click="editReviewPlatform('instagram')"><AppIcon name="settings" :size="15" />{{ reviewEditing.instagram ? "Editing" : "Edit Manually" }}</BaseButton></div>
              <BaseTextarea v-model="instagramContent.caption" label="Caption" :rows="7" :readonly="!reviewEditing.instagram" @input="markAssessmentNeedsRecheck('instagram')" />
              <BaseInput v-model="instagramContent.cta" label="CTA" :readonly="!reviewEditing.instagram" @input="markAssessmentNeedsRecheck('instagram')" />
              <BaseTextarea v-model="instagramContent.hashtags" label="Hashtags" :rows="2" :readonly="!reviewEditing.instagram" @input="markAssessmentNeedsRecheck('instagram')" />
            </div>
            <div class="review-asset-preview-panel">
              <div class="review-section-heading"><span class="brief-overline">Uploaded Creative</span><span class="review-muted">{{ instagramAssets.length }} assets</span></div>
              <div v-if="instagramAssets.length" class="review-asset-strip">
                <div v-for="(asset, index) in instagramAssets" :key="asset.id" class="review-asset-thumb"><img :src="asset.url" :alt="asset.name" /><span>{{ String(index + 1).padStart(2, "0") }}</span></div>
              </div>
              <p v-else class="creative-empty-note">No Instagram creative uploaded.</p>
            </div>
            <BrandAssessmentCard
              :assessment="reviewAssessments.instagram"
              :override-justification="reviewOverrides.instagram"
              @regenerate="regenerateReviewPlatform('instagram')"
              @recheck="recheckAlignment('instagram')"
              @override="openOverride('instagram')"
            />
          </div>
        </BaseCard>

        <BaseCard v-if="enabledPlatforms.linkedin" title="LinkedIn" description="Final B2B post copy and selected creative preview.">
          <template #actions><StatusBadge tone="neutral">LinkedIn</StatusBadge></template>
          <div class="review-platform-body">
            <div class="review-copy-fields">
              <div class="review-section-heading"><span class="brief-overline">Final Copy</span><BaseButton variant="ghost" size="compact" @click="editReviewPlatform('linkedin')"><AppIcon name="settings" :size="15" />{{ reviewEditing.linkedin ? "Editing" : "Edit Manually" }}</BaseButton></div>
              <BaseTextarea v-model="linkedInContent.postCopy" label="Post Copy" :rows="9" :readonly="!reviewEditing.linkedin" @input="markAssessmentNeedsRecheck('linkedin')" />
              <BaseInput v-model="linkedInContent.cta" label="CTA" :readonly="!reviewEditing.linkedin" @input="markAssessmentNeedsRecheck('linkedin')" />
              <BaseTextarea v-model="linkedInContent.hashtags" label="Hashtags" :rows="2" :readonly="!reviewEditing.linkedin" @input="markAssessmentNeedsRecheck('linkedin')" />
            </div>
            <div class="review-asset-preview-panel">
              <div class="review-section-heading"><span class="brief-overline">Uploaded Creative</span><span class="review-muted">{{ reuseInstagramCreative ? "Inherited from Instagram" : `${linkedInAssets.length} assets` }}</span></div>
              <div v-if="inheritedLinkedInAssets.length" class="review-asset-strip"><div v-for="(asset, index) in inheritedLinkedInAssets" :key="asset.id" class="review-asset-thumb"><img :src="asset.url" :alt="asset.name" /><span>{{ String(index + 1).padStart(2, "0") }}</span></div></div>
              <p v-else class="creative-empty-note">No LinkedIn creative uploaded.</p>
            </div>
            <BrandAssessmentCard
              :assessment="reviewAssessments.linkedin"
              :override-justification="reviewOverrides.linkedin"
              @regenerate="regenerateReviewPlatform('linkedin')"
              @recheck="recheckAlignment('linkedin')"
              @override="openOverride('linkedin')"
            />
          </div>
        </BaseCard>
      </section>

      <BaseCard title="Human Final Review" description="Complete every check before asking for approval.">
        <div class="human-review-layout">
          <div class="human-review-checklist">
            <BaseCheckbox v-model="reviewChecklist.copyReviewed" label="Copy reviewed" :disabled="isApproved" />
            <BaseCheckbox v-model="reviewChecklist.creativeReviewed" label="Creative reviewed" :disabled="isApproved" />
            <BaseCheckbox v-model="reviewChecklist.visualCopyConsistent" label="Visual and copy are consistent" :disabled="isApproved" />
            <BaseCheckbox v-model="reviewChecklist.noErrors" label="No obvious typo or incorrect claim" :disabled="isApproved" />
            <BaseCheckbox v-model="reviewChecklist.readyForPublication" label="Ready for publication" :disabled="isApproved" />
          </div>
          <div class="approval-panel">
            <span class="brief-overline">Human Approval</span>
            <p>AI assessment is advisory. A human must make the final approval decision.</p>
            <ul class="approval-requirements">
              <li :class="{ 'is-complete': reviewChecklistComplete }">Human checklist complete</li>
              <li :class="{ 'is-complete': !reviewNeedsRecheck }">All assessments re-checked</li>
              <li :class="{ 'is-complete': reviewOverridesComplete }">Warning justifications recorded</li>
              <li :class="{ 'is-complete': canContinueToReview }">Creative requirements satisfied</li>
            </ul>
            <div v-if="isApproved" class="approval-success"><StatusBadge tone="success" dot>Approved</StatusBadge><strong>Approved by: {{ approvedBy ?? 'Backend reviewer' }}</strong><span>{{ approvedTimestampLabel }}</span><BaseButton variant="secondary" size="compact" @click="router.push(`/content/${workflow.contentId}`)">Request Revision</BaseButton></div>
            <BaseButton v-else size="comfortable" :disabled="!canApproveContent" @click="approveContent">Approve Content <AppIcon name="check" :size="17" /></BaseButton>
          </div>
        </div>
      </BaseCard>

      <InlineAlert v-if="reviewValidation" title="Review action required" tone="warning">{{ reviewValidation }}</InlineAlert>

      <div class="review-footer">
        <BaseButton variant="ghost" @click="backFromReview"><AppIcon name="arrow-left" :size="16" />Back to Creative</BaseButton>
        <BaseButton v-if="isApproved" size="comfortable" @click="activeStep = 'schedule'">Continue to Schedule <AppIcon name="arrow-right" :size="17" /></BaseButton>
        <span v-else class="review-footer-hint">Approval unlocks the Schedule step.</span>
      </div>

      <BaseModal v-model="overrideModalOpen" title="Override Brand Check" description="This content has an alignment warning. Please explain why it should proceed." size="default">
        <BaseTextarea v-model="overrideJustification" label="Justification" :rows="4" :error="overrideError" required />
        <template #footer><BaseButton variant="ghost" @click="overrideModalOpen = false">Cancel</BaseButton><BaseButton @click="confirmOverride">Confirm Override</BaseButton></template>
      </BaseModal>
    </div>

    <div v-else-if="activeStep === 'schedule'" class="schedule-workspace">
      <template v-if="!isScheduled">
        <BaseCard title="Approved Content" description="A compact handoff summary for the publication plan.">
          <div class="approved-summary-grid">
            <div><span class="brief-overline">Content Title</span><strong>{{ generatedContent.title }}</strong></div>
            <div><span class="brief-overline">Product / Context</span><strong>{{ brief.context === 'company' ? companyContext.companyProfile.name : selectedProductName }}</strong></div>
            <div><span class="brief-overline">Content Pillar</span><strong>{{ selectedPillarLabel }}</strong></div>
            <div><span class="brief-overline">Objective</span><strong>{{ selectedObjectiveLabel }}</strong></div>
            <div><span class="brief-overline">Approved By</span><strong>{{ approvedBy ?? 'Backend reviewer' }}</strong></div>
            <div><span class="brief-overline">Approval Timestamp</span><strong>{{ approvedTimestampLabel }}</strong></div>
          </div>
          <template #footer><StatusBadge tone="success" dot>Approved by human review</StatusBadge></template>
        </BaseCard>

        <BaseCard title="Publication Schedule" description="Choose when each approved platform variant should be ready for manual publication.">
          <template #actions><BaseCheckbox v-model="useSameSchedule" label="Use same schedule for all platforms" @update:model-value="syncScheduleMode" /></template>
          <div class="schedule-platform-grid">
            <template v-for="row in schedulePlatformRows" :key="row.id">
              <section v-if="enabledPlatforms[row.id]" class="schedule-platform-card">
                <div class="schedule-platform-heading"><div><h3>{{ row.label }}</h3><span class="brief-overline">Approved variant</span></div><StatusBadge tone="success" dot>Approved</StatusBadge></div>
                <div class="schedule-fields">
                  <BaseInput
                    :model-value="row.schedule.date"
                    label="Publication date"
                    type="date"
                    :min="scheduleDateMinimum"
                    :disabled="row.id === 'linkedin' && useSameSchedule"
                    @update:model-value="updateScheduleDate(row.id, $event)"
                  />
                  <BaseInput
                    :model-value="row.schedule.time"
                    label="Publication time"
                    type="time"
                    :disabled="row.id === 'linkedin' && useSameSchedule"
                    @update:model-value="updateScheduleTime(row.id, $event)"
                  />
                </div>
                <div class="schedule-preview-grid">
                  <div><span class="brief-overline">Final copy preview</span><p>{{ row.copy }}</p></div>
                  <div><span class="brief-overline">Creative preview</span><div v-if="row.assets.length" class="schedule-asset-strip"><img v-for="asset in row.assets.slice(0, 3)" :key="asset.id" :src="asset.url" :alt="asset.name" /><span v-if="row.assets.length > 3">+{{ row.assets.length - 3 }}</span></div><p v-else class="creative-empty-note">No creative preview</p></div>
                </div>
              </section>
            </template>
          </div>
        </BaseCard>

        <InlineAlert v-if="scheduleValidation" title="Schedule validation" tone="warning">{{ scheduleValidation }}</InlineAlert>

        <div class="schedule-footer">
          <BaseButton variant="ghost" @click="activeStep = 'review'"><AppIcon name="arrow-left" :size="16" />Back to Review</BaseButton>
          <BaseButton size="comfortable" @click="scheduleContent">Schedule Content <AppIcon name="calendar" :size="17" /></BaseButton>
        </div>
      </template>

      <BaseCard v-else title="Content Scheduled" description="The approved content is now recorded in the backend.">
        <div class="schedule-success-state"><StatusBadge tone="success" dot>Scheduled</StatusBadge><h2>Ready for manual publication</h2><p>Publishing remains manual. Shifd Marketing will keep the approved copy, creative assets, and schedule ready for publication.</p></div>
        <div class="scheduled-platform-list">
          <template v-for="row in schedulePlatformRows" :key="row.id"><div v-if="enabledPlatforms[row.id]" class="scheduled-platform-row"><div><strong>{{ row.label }}</strong><span>{{ formatScheduleDate(row.record.date, row.record.time) }}</span></div><StatusBadge tone="success">{{ row.record.status }}</StatusBadge></div></template>
        </div>
        <template #footer>
          <div class="schedule-success-actions"><BaseButton variant="secondary" @click="router.push('/calendar')"><AppIcon name="calendar" :size="16" />View in Calendar</BaseButton><BaseButton variant="secondary" @click="router.push(`/content/${workflow.contentId}`)">View Content</BaseButton><BaseButton @click="resetWorkflow"><AppIcon name="plus" :size="16" />Create Another Content</BaseButton></div>
        </template>
      </BaseCard>
    </div>

    <div v-else class="brief-workbench">
      <section class="brief-form-panel">
        <BaseCard>
          <div class="brief-form-stack">
            <div class="brief-form-grid">
              <div class="brief-field-group">
                <div class="brief-field-heading">
                  <span class="brief-overline">Content Context</span
                  ><span
                    class="brief-help"
                    title="Choose whether this brief is grounded in company or product context"
                    ><AppIcon name="info" :size="14" /> Context scope</span
                  >
                </div>
                <div
                  class="segmented-control"
                  role="radiogroup"
                  aria-label="Content context"
                >
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="brief.context === 'company'"
                    :class="{ 'is-selected': brief.context === 'company' }"
                    @click="brief.context = 'company'"
                  >
                    Company
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="brief.context === 'product'"
                    :class="{ 'is-selected': brief.context === 'product' }"
                    @click="brief.context = 'product'"
                  >
                    Product
                  </button>
                </div>
              </div>
              <div class="brief-field-group">
                <div class="brief-field-heading">
                  <span class="brief-overline">Product Asset Link</span
                  ><StatusBadge
                    :tone="brief.context === 'product' ? 'success' : 'info'"
                    dot
                    >{{
                      brief.context === 'product'
                        ? 'Context active'
                        : 'Company context'
                    }}</StatusBadge
                  >
                </div>
                <div class="brief-product-select">
                  <BaseSelect
                    v-model="brief.product"
                    label="Product asset"
                    :options="productOptions"
                    :disabled="brief.context === 'company'"
                  />
                </div>
              </div>
            </div>

            <fieldset class="brief-field-group brief-fieldset">
              <legend class="brief-field-heading">
                <span class="brief-overline">Content Pillar</span
                ><span class="brief-help">Select a core narrative angle</span>
              </legend>
              <div
                class="choice-chip-grid"
                role="radiogroup"
                aria-label="Content pillar"
              >
                <button
                  v-for="item in pillarOptions"
                  :key="item.value"
                  type="button"
                  role="radio"
                  :aria-checked="brief.pillar === item.value"
                  class="choice-chip"
                  :class="{ 'is-selected': brief.pillar === item.value }"
                  @click="choosePillar(item.value)"
                >
                  <AppIcon :name="item.icon" :size="16" /><span>{{
                    item.label
                  }}</span
                  ><span
                    v-if="brief.pillar === item.value"
                    class="choice-chip__dot"
                  />
                </button>
              </div>
            </fieldset>

            <fieldset class="brief-field-group brief-fieldset">
              <legend class="brief-field-heading">
                <span class="brief-overline">Strategic Objective</span
                ><span class="brief-help">Target conversion funnel tier</span>
              </legend>
              <div
                class="objective-grid"
                role="radiogroup"
                aria-label="Strategic objective"
              >
                <button
                  v-for="item in objectiveOptions"
                  :key="item.value"
                  type="button"
                  role="radio"
                  :aria-checked="brief.objective === item.value"
                  class="objective-choice"
                  :class="{ 'is-selected': brief.objective === item.value }"
                  @click="chooseObjective(item.value)"
                >
                  <AppIcon :name="item.icon" :size="18" /><span>{{
                    item.label
                  }}</span>
                </button>
              </div>
            </fieldset>

            <div class="brief-field-group">
              <div class="brief-field-heading">
                <span class="brief-overline">Target Audience</span
                ><span class="brief-help">Enter an audience or use Quick Add</span>
              </div>
              <BaseInput
                v-model="brief.audience"
                label="Target audience"
                aria-label="Target audience"
              />
              <div class="quick-add-row">
                <span class="brief-overline">Quick Add:</span
                ><button
                  v-for="suggestion in audienceSuggestions"
                  :key="suggestion"
                  type="button"
                  class="quick-add-chip"
                  @click="addAudience(suggestion)"
                >
                  + {{ suggestion }}
                </button>
              </div>
            </div>

            <BaseInput
              v-model="brief.topic"
              label="Topic / Primary Narrative"
              :hint="`${topicLength} characters`"
              class="brief-large-input"
            />

            <div class="brief-field-group">
              <div class="brief-field-heading">
                <span class="brief-overline">Content Angle &amp; Thesis</span
                ><span class="brief-help">Edit directly in the field</span>
              </div>
              <BaseTextarea
                v-model="brief.thesis"
                label="Content angle and thesis"
                :rows="4"
              />
            </div>

            <div class="brief-field-group">
              <div class="brief-field-heading">
                <span class="brief-overline"
                  >Execution Constraints &amp; Style Tone</span
                ><span class="brief-help">Negative prompt guardrails</span>
              </div>
              <BaseTextarea
                v-model="brief.constraints"
                label="Execution constraints and style tone"
                :rows="3"
              />
            </div>
          </div>
        </BaseCard>

        <div class="brief-action-bar">
          <div class="brief-action-left">
            <BaseButton variant="ghost" @click="cancelBrief">Cancel</BaseButton
            ><BaseButton
              variant="secondary"
              :loading="isSaving"
              @click="saveDraft"
              ><AppIcon name="library" :size="17" />Save as Draft</BaseButton
            ><span v-if="savedAt" class="save-status"
              >Saved at {{ savedAt }}</span
            >
          </div>
          <div class="brief-action-right">
            <span class="token-estimate">Est. tokens: <strong>650</strong></span
            ><BaseButton size="comfortable" @click="continueToGenerate"
              >Generate Content <AppIcon name="sparkles" :size="18"
            /></BaseButton>
          </div>
        </div>
      </section>

      <aside class="brief-inspector" aria-label="Brief context inspector">
        <BaseCard title="Active Context">
          <template #actions
            ><StatusBadge tone="success" dot>Active</StatusBadge></template
          >
          <div class="context-visual">
              <div><span>{{ activeContextName }}</span></div>
          </div>
          <dl class="context-details">
            <div>
              <dt>{{ brief.context === "company" ? "Context type" : "Product" }}</dt>
              <dd>{{ brief.context === "company" ? "Company" : selectedProductName }}</dd>
            </div>
            <div>
              <dt>Company context</dt>
              <dd>{{ companyContext.companyProfile.name }}</dd>
            </div>
            <div>
              <dt>{{ brief.context === "company" ? "Target segments" : "Target audience" }}</dt>
              <dd>{{ activeContextAudience }}</dd>
            </div>
            <div>
              <dt>Primary objective</dt>
              <dd>{{ selectedObjectiveLabel }}</dd>
            </div>
            <div>
              <dt>Value proposition</dt>
              <dd>{{ activeContextValue }}</dd>
            </div>
            <div v-if="brief.context === 'company'">
              <dt>Brand voice</dt>
              <dd>{{ companyContext.brandProfile.brandVoice }}</dd>
            </div>
            <div v-else>
              <dt>Inherits from</dt>
              <dd>{{ resolvedProductContext?.company.companyProfile.name }}</dd>
            </div>
            <div v-if="brief.context === 'product'">
              <dt>Brand voice</dt>
              <dd>{{ activeBrandVoice }}</dd>
            </div>
          </dl>
        </BaseCard>

        <BaseCard title="Brief Readiness">
          <template #actions
            ><StatusBadge :tone="isBriefReady ? 'success' : 'warning'" dot>{{
              isBriefReady ? "Ready to generate" : "Needs details"
            }}</StatusBadge></template
          >
          <div class="readiness-list">
            <div
              v-for="item in briefReadinessItems"
              :key="item.label"
              class="readiness-item"
              :class="{ 'is-complete': item.complete }"
            >
              <AppIcon
                :name="item.complete ? 'check' : 'circle'"
                :size="16"
              />
              <span>{{ item.label }}</span>
              <small v-if="item.optional">Optional</small>
            </div>
          </div>
        </BaseCard>

        <BaseCard title="Recent Ideas">
          <p v-if="!recentIdeas.length" class="text-sm text-muted">No Ready ideas yet. Add an idea in the Idea Bank.</p>
          <div class="recent-angle-list">
            <button
              v-for="idea in recentIdeas"
              :key="idea.id"
              type="button"
              @click="applyRecentIdea(idea)"
            >
              <strong>{{ idea.title }}</strong><span>{{ pillarOptions.find((option) => option.value === idea.pillar)?.label }} · {{ idea.contextType === 'company' ? companyContext.companyProfile.name : productsStore.nameFor(idea.productId) }}</span>
            </button>
          </div>
          <button
            type="button"
            class="brief-text-action recent-ideas-link"
            @click="router.push('/content/ideas')"
          >
            View all ideas <AppIcon name="arrow-right" :size="14" />
          </button>
        </BaseCard>
      </aside>
    </div>
  </div>
</template>
