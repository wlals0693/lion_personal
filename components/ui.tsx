'use client';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Sparkles,
  LoaderCircle,
  Shirt,
  AlertCircle,
  X,
} from 'lucide-react';
import type { Garment, Outfit } from '@/lib/types';
import { useEffect, useRef, type ReactNode } from 'react';

export function MockLabel({ children = '체험용 예시' }: { children?: ReactNode }) {
  return (
    <span className="mock-label">
      <Sparkles size={12} />
      {children}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: string;
}) {
  return (
    <div className="page-heading">
      {back && (
        <Link href={back} className="back-link">
          <ArrowLeft size={16} />
          돌아가기
        </Link>
      )}
      <div className="heading-row">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="subtle heading-description">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
export function Loading({ text = '옷장을 준비하고 있어요' }: { text?: string }) {
  return (
    <div className="state-box" role="status">
      <LoaderCircle className="spin" size={30} />
      <h2>{text}</h2>
      <p className="subtle">잠시만 기다려주세요.</p>
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={22} />
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  href,
  label = '옷 등록하기',
  onClick,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <div className="state-box">
      <Shirt size={36} strokeWidth={1} />
      <h2>{title}</h2>
      <p className="subtle">{description}</p>
      {href ? (
        <Link className="button primary" href={href}>
          {label}
          <ArrowRight size={16} />
        </Link>
      ) : onClick ? (
        <button className="button primary" onClick={onClick}>
          {label}
        </button>
      ) : null}
    </div>
  );
}
export function GarmentImage({
  item,
  className = '',
}: {
  item: Pick<Garment, 'image' | 'name'>;
  className?: string;
}) {
  return (
    <div className={`garment-image ${className}`}>
      <img
        src={item.image}
        alt={item.name}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement?.classList.add('image-failed');
        }}
      />
      <span className="image-fallback">사진을 표시할 수 없어요</span>
    </div>
  );
}
export function GarmentCard({ item }: { item: Garment }) {
  return (
    <Link className="garment-card" href={`/wardrobe/${item.id}`}>
      <div className="image-wrap">
        <GarmentImage item={item} />
        {item.excluded && <span className="excluded-badge">추천 제외</span>}
        {item.source === 'upload' && <span className="new-badge">NEW</span>}
      </div>
      <span className="item-category">
        {item.category} · {item.color}
      </span>
      <h3>{item.name}</h3>
    </Link>
  );
}
export function OutfitCollage({
  outfit,
  items,
  large = false,
}: {
  outfit: Outfit;
  items: Garment[];
  large?: boolean;
}) {
  const garments = outfit.itemIds
    .map((id) => items.find((g) => g.id === id))
    .filter((g): g is Garment => !!g);
  return (
    <div className={`outfit-collage ${large ? 'large' : ''}`}>
      {garments.map((g, i) => (
        <div className={`collage-piece piece-${i}`} key={g.id}>
          <GarmentImage item={g} />
          <span>{g.category}</span>
        </div>
      ))}
    </div>
  );
}
export function SectionHeading({
  title,
  href,
  label = '전체 보기',
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {href && (
        <Link href={href}>
          {label}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Tab') {
            const controls = ref.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input, select, textarea',
            );
            if (!controls?.length) return;
            const first = controls[0],
              last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button autoFocus className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function AddButton() {
  return (
    <Link href="/wardrobe/new" className="button primary">
      <Plus size={17} />
      <span>옷 등록</span>
    </Link>
  );
}
