import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAuthor } from '@/hooks/useAuthor';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, MapPin, Loader2, X, Upload, Mail } from 'lucide-react';
import { HAZARD_TYPES, SEVERITY_LEVELS, KIND_ROAD_REPORT, getDistrictEmail } from '@/lib/constants';
import { encodeGeohash } from '@/lib/geohash';
import { lookupRoadDistrict } from '@/lib/jurisdiction';
import { useNostrMail } from '@/hooks/useNostrMail';
import { LoginArea } from '@/components/auth/LoginArea';

interface ReportFormProps {
  selectedLocation: { lat: number; lng: number } | null;
  onLocationSelect: (lat: number, lng: number) => void;
  onReportCreated?: () => void;
  onClearLocation?: () => void;
}

export function ReportForm({ selectedLocation, onLocationSelect, onReportCreated, onClearLocation }: ReportFormProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { sendReportNotification } = useNostrMail();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const author = useAuthor(user?.pubkey);
  const hasProfileName = !!author.data?.metadata?.name;

  // Pre-fill random test data in dev mode so you can submit faster
  const testDefaults = import.meta.env.DEV
    ? {
        title: `Test pothole #${Math.floor(Math.random() * 900 + 100)}`,
        reporterName: 'Test Reporter',
        description: 'Large pothole near the intersection, about 2ft wide. Cars swerving to avoid it.',
        hazardType: 'pothole',
        severity: 'high',
        locationDesc: 'Main St near Oak Ave',
        contactEmail: 'test@example.com',
        contactPhone: '555-123-4567',
        wantsFollowUp: true,
      }
    : null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState(testDefaults?.title ?? '');
  const [reporterName, setReporterName] = useState(testDefaults?.reporterName ?? '');
  const [description, setDescription] = useState(testDefaults?.description ?? '');
  const [hazardType, setHazardType] = useState(testDefaults?.hazardType ?? '');
  const [severity, setSeverity] = useState(testDefaults?.severity ?? '');
  const [locationDesc, setLocationDesc] = useState(testDefaults?.locationDesc ?? '');
  const [imageUrl, setImageUrl] = useState('');
  const [district, setDistrict] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [wantsFollowUp, setWantsFollowUp] = useState(testDefaults?.wantsFollowUp ?? false);
  const [contactEmail, setContactEmail] = useState(testDefaults?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(testDefaults?.contactPhone ?? '');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect district when location changes
  useEffect(() => {
    if (selectedLocation) {
      const info = lookupRoadDistrict(selectedLocation.lat, selectedLocation.lng);
      setDistrict(info?.name ?? '');
    } else {
      setDistrict('');
    }
  }, [selectedLocation]);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strip EXIF data by drawing to canvas and re-encoding
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const cleanFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
        setImageFile(cleanFile);
        setImagePreview(canvas.toDataURL('image/jpeg', 0.9));
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.9);
    };
    img.src = url;
  }, []);

  const clearImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setReporterName('');
    setDescription('');
    setHazardType('');
    setSeverity('');
    setLocationDesc('');
    setImageUrl('');
    setDistrict('');
    clearImage();
    setWantsFollowUp(false);
    setContactEmail('');
    setContactPhone('');
  }, [clearImage]);

  const handleSubmit = useCallback(async () => {
    if (!user || !selectedLocation || !hazardType || !severity) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all required fields and select a location on the map.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasProfileName && !reporterName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter your name to submit a report.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Publish kind 0 profile if user doesn't have a name set
      if (!hasProfileName && reporterName.trim()) {
        try {
          const existingMeta = author.data?.event?.content ?? '{}';
          const parsed = JSON.parse(existingMeta);
          const updatedMeta = JSON.stringify({ ...parsed, name: reporterName.trim() });
          await publishEvent({
            kind: 0,
            content: updatedMeta,
            tags: [],
            created_at: Math.floor(Date.now() / 1000),
          });
        } catch {
          console.warn('Failed to publish profile, continuing with report');
        }
      }
      // Upload image if provided
      let finalImageUrl = imageUrl;
      if (imageFile) {
        try {
          const tags = await uploadFile(imageFile);
          finalImageUrl = tags[0]?.[1] || '';
        } catch {
          console.warn('Image upload failed, continuing without image');
        }
      }

      const districtName = district;

      const geohash = encodeGeohash(selectedLocation.lat, selectedLocation.lng, 8);

      const tags: string[][] = [
        ['d', crypto.randomUUID()],
        ['g', geohash],
        ['title', title || `Road hazard: ${hazardType}`],
        ['type', hazardType],
        ['severity', severity],
        ['status', 'open'],
        ['alt', 'Road hazard report'],
        ['lat', String(selectedLocation.lat)],
        ['lng', String(selectedLocation.lng)],
      ];

      if (locationDesc) tags.push(['location', locationDesc]);
      if (finalImageUrl) tags.push(['image', finalImageUrl]);
      if (districtName) tags.push(['district', districtName]);

      await publishEvent({
        kind: KIND_ROAD_REPORT,
        content: description,
        tags,
      });

      // Send email notification via Lambda
      let emailError: string | undefined;
      try {
        const displayName = author.data?.metadata?.name || reporterName.trim() || 'Anonymous';
        await sendReportNotification({
          title: title || `Road hazard: ${hazardType}`,
          type: hazardType,
          severity,
          description,
          location: locationDesc,
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          district: districtName || undefined,
          reporterName: displayName,
          imageUrl: finalImageUrl || undefined,
          contactEmail: wantsFollowUp ? contactEmail : undefined,
          contactPhone: wantsFollowUp ? contactPhone : undefined,
        });
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'Unknown error';
        console.error('nostr-mail:', err);
      }

      toast({
        title: 'Report Submitted!',
        description: emailError
          ? `Report published but email failed: ${emailError}`
          : `Your road hazard report has been published to Nostr.${districtName ? ` District: ${districtName}.` : ''}`,
        variant: emailError ? 'destructive' : undefined,
        duration: emailError ? 15000 : undefined,
      });

      resetForm();
      onClearLocation?.();
      onReportCreated?.();
      queryClient.invalidateQueries({ queryKey: ['road-reports'] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive',
      });
      console.error('Report submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    user, selectedLocation, title, description, hazardType, severity,
    locationDesc, imageUrl, district, imageFile, publishEvent, uploadFile,
    resetForm, onReportCreated, onClearLocation, toast,
    wantsFollowUp, contactEmail, contactPhone, hasProfileName, reporterName,
    author.data, sendReportNotification,
  ]);

  if (!selectedLocation) {
    return (
      <div className="text-center py-6 px-2">
        <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">Click the map to select a location</p>
        <p className="text-xs text-muted-foreground mt-1">Then fill out the hazard report</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-4 px-2">
        <AlertCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-3">Sign in to report hazards</p>
        <LoginArea />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Location indicator + district */}
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-2.5 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <span className="text-xs text-blue-700 dark:text-blue-300 flex-1 truncate">
          {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { resetForm(); onClearLocation?.(); }}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Auto-detected district and email destination */}
      <div>
        <Label className="text-xs font-medium">Road District</Label>
        <div className="mt-1 h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm">
          {district ? (
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">{district}</span>
          ) : (
            <span className="text-muted-foreground italic">Outside Ray County</span>
          )}
        </div>
        {district && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span>Report will be sent to {getDistrictEmail(district)}</span>
          </div>
        )}
      </div>

      {/* Name (only if no profile name set) */}
      {!hasProfileName && (
        <div>
          <Label htmlFor="reporter-name" className="text-xs font-medium">Your Name *</Label>
          <Input
            id="reporter-name"
            placeholder="Enter your name"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            className="mt-1 h-9 text-sm"
          />
        </div>
      )}

      {/* Title */}
      <div>
        <Label htmlFor="report-title" className="text-xs font-medium">Title *</Label>
        <Input
          id="report-title"
          placeholder="Brief description"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 h-9 text-sm"
        />
      </div>

      {/* Type and Severity */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs font-medium">Type *</Label>
          <Select value={hazardType} onValueChange={setHazardType}>
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {HAZARD_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium">Severity *</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: level.color }} />
                    {level.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Location Description */}
      <div>
        <Label htmlFor="location-desc" className="text-xs font-medium">Location</Label>
        <Input
          id="location-desc"
          placeholder="e.g., Main St near Oak Ave"
          value={locationDesc}
          onChange={(e) => setLocationDesc(e.target.value)}
          className="mt-1 h-9 text-sm"
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="report-desc" className="text-xs font-medium">Details</Label>
        <Textarea
          id="report-desc"
          placeholder="Describe the hazard..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 text-sm"
        />
      </div>

      {/* Image Upload */}
      <div>
        <Label className="text-xs font-medium">Photo (optional)</Label>
        <div className="mt-1">
          {imagePreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img src={imagePreview} alt="Preview" className="w-full h-28 object-cover" />
              <Button
                variant="ghost"
                size="sm"
                onClick={clearImage}
                className="absolute top-1 right-1 bg-black/50 text-white hover:bg-black/70 h-6 w-6 p-0 rounded-full"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-blue-400 transition-colors">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Upload className="h-4 w-4" />
                <span className="text-xs">Upload photo</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Contact info for follow-up */}
      <div>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={wantsFollowUp}
            onChange={(e) => setWantsFollowUp(e.target.checked)}
            className="rounded border-gray-300"
          />
          Provide contact info for follow-up
        </label>
        {wantsFollowUp && (
          <div className="mt-2 space-y-2">
            <Input
              placeholder="Email address"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="h-9 text-sm"
            />
            <Input
              placeholder="Phone number"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        )}
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !hazardType || !severity || (!hasProfileName && !reporterName.trim())}
        className="w-full h-10 text-sm font-bold rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 mr-2" />
            Submit Report
          </>
        )}
      </Button>
    </div>
  );
}
