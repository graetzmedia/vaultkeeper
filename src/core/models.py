"""
Data models for the VaultKeeper system.

This module defines SQLAlchemy models that represent the database schema.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    create_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

Base = declarative_base()


class Drive(Base):
    """Model representing a physical storage drive."""

    __tablename__ = "drives"

    id = Column(String(36), primary_key=True)
    label = Column(String(255))
    volume_name = Column(String(255))
    drive_type = Column(String(50))  # HDD, SSD, etc.
    filesystem = Column(String(50))  # NTFS, ext4, etc.
    size_bytes = Column(Integer)
    used_bytes = Column(Integer)
    free_bytes = Column(Integer)
    serial_number = Column(String(100))
    model = Column(String(255))
    vendor = Column(String(255))
    date_cataloged = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, default=datetime.utcnow)
    location_id = Column(String(36), ForeignKey("locations.id"), nullable=True)
    status = Column(String(50), default="AVAILABLE")  # AVAILABLE, CHECKED_OUT, etc.
    qr_code_path = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    files = relationship("File", back_populates="drive", cascade="all, delete-orphan")
    health_checks = relationship("DriveHealth", back_populates="drive", cascade="all, delete-orphan")
    location = relationship("Location", back_populates="drives")
    movements = relationship("DriveMovement", back_populates="drive", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            "id": self.id,
            "label": self.label,
            "volume_name": self.volume_name,
            "drive_type": self.drive_type,
            "filesystem": self.filesystem,
            "size_bytes": self.size_bytes,
            "used_bytes": self.used_bytes,
            "free_bytes": self.free_bytes,
            "serial_number": self.serial_number,
            "model": self.model,
            "vendor": self.vendor,
            "date_cataloged": self.date_cataloged.isoformat() if self.date_cataloged else None,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "location_id": self.location_id,
            "status": self.status,
            "qr_code_path": self.qr_code_path,
            "notes": self.notes,
        }


class File(Base):
    """Model representing a file on a drive."""

    __tablename__ = "files"

    id = Column(String(36), primary_key=True)
    drive_id = Column(String(36), ForeignKey("drives.id"), nullable=False)
    path = Column(String(4096), nullable=False)
    filename = Column(String(255), nullable=False)
    extension = Column(String(50), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    created_time = Column(DateTime, nullable=True)
    modified_time = Column(DateTime, nullable=True)
    accessed_time = Column(DateTime, nullable=True)
    mime_type = Column(String(255), nullable=True)
    checksum = Column(String(255), nullable=True)
    is_media = Column(Boolean, default=False)
    thumbnail_path = Column(String(4096), nullable=True)

    # Relationships
    drive = relationship("Drive", back_populates="files")
    media_info = relationship("MediaInfo", back_populates="file", uselist=False, cascade="all, delete-orphan")
    projects = relationship("Project", secondary="project_files", back_populates="files")


class MediaInfo(Base):
    """Model representing media file metadata."""

    __tablename__ = "media_info"

    id = Column(String(36), primary_key=True)
    file_id = Column(String(36), ForeignKey("files.id"), nullable=False)
    media_type = Column(String(50))  # video, audio, image
    codec = Column(String(100), nullable=True)
    format = Column(String(100), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    framerate = Column(Float, nullable=True)
    bitrate = Column(Integer, nullable=True)
    audio_channels = Column(Integer, nullable=True)
    audio_sample_rate = Column(Integer, nullable=True)
    camera_make = Column(String(255), nullable=True)
    camera_model = Column(String(255), nullable=True)
    is_red = Column(Boolean, default=False)
    metadata = Column(Text, nullable=True)  # JSON string for additional metadata

    # Relationships
    file = relationship("File", back_populates="media_info")


class Project(Base):
    """Model representing a project."""

    __tablename__ = "projects"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    client = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    created_date = Column(DateTime, default=datetime.utcnow)
    modified_date = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    files = relationship("File", secondary="project_files", back_populates="projects")


# Association table for Project-File relationship
project_files = Table(
    "project_files",
    Base.metadata,
    Column("project_id", String(36), ForeignKey("projects.id"), primary_key=True),
    Column("file_id", String(36), ForeignKey("files.id"), primary_key=True),
)


class Location(Base):
    """Model representing a physical storage location."""

    __tablename__ = "locations"

    id = Column(String(36), primary_key=True)
    bay = Column(Integer, nullable=False)
    shelf = Column(Integer, nullable=False)
    position = Column(Integer, nullable=False)
    status = Column(String(50), default="EMPTY")  # EMPTY, OCCUPIED, RESERVED
    qr_code_path = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    drives = relationship("Drive", back_populates="location")

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            "id": self.id,
            "bay": self.bay,
            "shelf": self.shelf,
            "position": self.position,
            "status": self.status,
            "qr_code_path": self.qr_code_path,
            "notes": self.notes,
        }


class DriveMovement(Base):
    """Model representing a drive movement history."""

    __tablename__ = "drive_movements"

    id = Column(String(36), primary_key=True)
    drive_id = Column(String(36), ForeignKey("drives.id"), nullable=False)
    location_id = Column(String(36), ForeignKey("locations.id"), nullable=True)
    action = Column(String(50), nullable=False)  # CHECKIN, CHECKOUT
    user = Column(String(255), nullable=True)
    purpose = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    drive = relationship("Drive", back_populates="movements")
    location = relationship("Location")


class DriveHealth(Base):
    """Model representing drive health check results."""

    __tablename__ = "drive_health"

    id = Column(String(36), primary_key=True)
    drive_id = Column(String(36), ForeignKey("drives.id"), nullable=False)
    check_date = Column(DateTime, default=datetime.utcnow)
    check_type = Column(String(50), nullable=False)  # QUICK, FULL, STICTION, etc.
    device_path = Column(String(255), nullable=True)
    smart_status = Column(String(50), nullable=True)
    reallocated_sectors = Column(Integer, nullable=True)
    pending_sectors = Column(Integer, nullable=True)
    uncorrectable_sectors = Column(Integer, nullable=True)
    spin_up_time = Column(Float, nullable=True)
    rotation_stability = Column(Float, nullable=True)
    read_speed_mbs = Column(Float, nullable=True)
    temperature_c = Column(Float, nullable=True)
    test_results = Column(Text, nullable=True)  # JSON string for detailed results
    recommendation = Column(String(255), nullable=True)
    passed = Column(Boolean, nullable=True)

    # Relationships
    drive = relationship("Drive", back_populates="health_checks")


def init_db(db_path: str) -> sessionmaker:
    """Initialize the database and return a session factory."""
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)