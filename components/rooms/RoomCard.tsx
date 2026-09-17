import Link from "next/link";
import { DoorOpen, Users, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatVND } from "@/lib/utils/format";
import type { PublicRoom } from "@/lib/data/rooms";

interface RoomCardProps {
  room: PublicRoom;
}

export function RoomCard({ room }: RoomCardProps) {
  const hasImage = Boolean(room.image_paths && room.image_paths.length > 0);
  const primaryImage = hasImage ? room.image_paths[0] : null;

  return (
    <div className="bg-white rounded-2xl border border-dark/10 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group">
      {/* Room Image Container */}
      <div className="h-52 bg-light/70 border-b border-dark/10 flex items-center justify-center relative overflow-hidden">
        {primaryImage && primaryImage.startsWith("/") ? (
          // In case local image exists, render img; fallback to placeholder on error
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage}
            alt={room.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              // Graceful fallback to placeholder container on broken image link
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const placeholder = parent.querySelector(".room-placeholder");
                if (placeholder) (placeholder as HTMLElement).style.display = "flex";
              }
            }}
          />
        ) : null}

        {/* Tasteful Neutral Kapi House Placeholder */}
        <div
          className={`room-placeholder w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-center ${
            primaryImage && primaryImage.startsWith("/") ? "hidden" : "flex"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <DoorOpen className="w-6 h-6" />
          </div>
          <span className="text-xs text-dark/40 font-medium tracking-wide">
            Kapi Stay Concierge
          </span>
        </div>

        {/* Capacity badge */}
        <div className="absolute top-3 right-3">
          <Badge variant="neutral" size="sm" icon={<Users className="w-3 h-3" />}>
            {room.capacity} khách
          </Badge>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-5 sm:p-6 flex flex-col flex-1">
        {room.property && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{room.property.name}</span>
          </div>
        )}

        <h2 className="text-lg font-bold text-dark mb-2 group-hover:text-primary transition-colors">
          <Link href={`/rooms/${room.id}`}>{room.name}</Link>
        </h2>

        {room.description && (
          <p className="text-xs text-dark/60 line-clamp-2 mb-4 leading-relaxed">
            {room.description}
          </p>
        )}

        {/* Amenities Excerpt */}
        {room.amenities.length > 0 && (
          <ul className="space-y-1.5 mb-6 text-xs text-dark/70 flex-1">
            {room.amenities.slice(0, 4).map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="truncate">{item}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Price & CTA */}
        <div className="pt-4 border-t border-dark/10 flex items-center justify-between mt-auto gap-3">
          <div>
            <span className="text-lg font-bold text-primary">
              {formatVND(room.nightly_price_vnd)}
            </span>
            <span className="text-xs text-dark/60"> / đêm</span>
          </div>

          <Link href={`/rooms/${room.id}`}>
            <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Xem chi tiết
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
