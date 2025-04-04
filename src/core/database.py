"""
Database operations for the VaultKeeper system.

This module provides functions for interacting with the database, including
CRUD operations for drives, files, locations, and other entities.
"""

import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

from sqlalchemy.orm import Session

from vaultkeeper.core.models import (
    Drive,
    DriveHealth,
    DriveMovement,
    File,
    Location,
    MediaInfo,
    Project,
    init_db,
)


class Database:
    """Database manager for VaultKeeper."""

    def __init__(self, db_path: str):
        """Initialize the database manager.
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.Session = init_db(db_path)

    # Drive operations
    def add_drive(self, drive_info: Dict[str, Any]) -> str:
        """Add a drive to the database.
        
        Args:
            drive_info: Dictionary containing drive information
            
        Returns:
            The ID of the new drive
        """
        session = self.Session()
        try:
            drive_id = drive_info.get("id", str(uuid.uuid4()))
            drive = Drive(id=drive_id, **drive_info)
            session.add(drive)
            session.commit()
            return drive_id
        finally:
            session.close()

    def get_drive(self, drive_id: str) -> Optional[Dict[str, Any]]:
        """Get drive information by ID.
        
        Args:
            drive_id: Drive ID
            
        Returns:
            Dictionary containing drive information or None if not found
        """
        session = self.Session()
        try:
            drive = session.query(Drive).filter(Drive.id == drive_id).first()
            if drive:
                return drive.to_dict()
            return None
        finally:
            session.close()

    def update_drive(self, drive_id: str, drive_info: Dict[str, Any]) -> bool:
        """Update drive information.
        
        Args:
            drive_id: Drive ID
            drive_info: Dictionary containing updated drive information
            
        Returns:
            True if the update was successful, False otherwise
        """
        session = self.Session()
        try:
            drive = session.query(Drive).filter(Drive.id == drive_id).first()
            if not drive:
                return False
                
            # Update drive fields
            for key, value in drive_info.items():
                if hasattr(drive, key):
                    setattr(drive, key, value)
            
            drive.last_updated = datetime.utcnow()
            session.commit()
            return True
        finally:
            session.close()

    def delete_drive(self, drive_id: str) -> bool:
        """Delete a drive from the database.
        
        Args:
            drive_id: Drive ID
            
        Returns:
            True if the deletion was successful, False otherwise
        """
        session = self.Session()
        try:
            drive = session.query(Drive).filter(Drive.id == drive_id).first()
            if not drive:
                return False
                
            session.delete(drive)
            session.commit()
            return True
        finally:
            session.close()

    def list_drives(self) -> List[Dict[str, Any]]:
        """List all drives in the database.
        
        Returns:
            List of dictionaries containing drive information
        """
        session = self.Session()
        try:
            drives = session.query(Drive).all()
            return [drive.to_dict() for drive in drives]
        finally:
            session.close()

    # File operations
    def add_file(self, file_info: Dict[str, Any]) -> str:
        """Add a file to the database.
        
        Args:
            file_info: Dictionary containing file information
            
        Returns:
            The ID of the new file
        """
        session = self.Session()
        try:
            file_id = file_info.get("id", str(uuid.uuid4()))
            file = File(id=file_id, **file_info)
            session.add(file)
            session.commit()
            return file_id
        finally:
            session.close()

    def get_file(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file information by ID.
        
        Args:
            file_id: File ID
            
        Returns:
            Dictionary containing file information or None if not found
        """
        session = self.Session()
        try:
            file = session.query(File).filter(File.id == file_id).first()
            if not file:
                return None
                
            result = {
                "id": file.id,
                "drive_id": file.drive_id,
                "path": file.path,
                "filename": file.filename,
                "extension": file.extension,
                "size_bytes": file.size_bytes,
                "created_time": file.created_time.isoformat() if file.created_time else None,
                "modified_time": file.modified_time.isoformat() if file.modified_time else None,
                "accessed_time": file.accessed_time.isoformat() if file.accessed_time else None,
                "mime_type": file.mime_type,
                "checksum": file.checksum,
                "is_media": file.is_media,
                "thumbnail_path": file.thumbnail_path,
            }
            
            # Add media info if available
            if file.media_info:
                result["media_info"] = {
                    "media_type": file.media_info.media_type,
                    "codec": file.media_info.codec,
                    "format": file.media_info.format,
                    "duration_seconds": file.media_info.duration_seconds,
                    "width": file.media_info.width,
                    "height": file.media_info.height,
                    "framerate": file.media_info.framerate,
                    "bitrate": file.media_info.bitrate,
                    "audio_channels": file.media_info.audio_channels,
                    "audio_sample_rate": file.media_info.audio_sample_rate,
                    "camera_make": file.media_info.camera_make,
                    "camera_model": file.media_info.camera_model,
                    "is_red": file.media_info.is_red,
                    "metadata": file.media_info.metadata,
                }
                
            return result
        finally:
            session.close()

    def add_media_info(self, file_id: str, media_info: Dict[str, Any]) -> str:
        """Add media information for a file.
        
        Args:
            file_id: File ID
            media_info: Dictionary containing media information
            
        Returns:
            The ID of the new media info record
        """
        session = self.Session()
        try:
            media_id = media_info.get("id", str(uuid.uuid4()))
            media = MediaInfo(id=media_id, file_id=file_id, **media_info)
            session.add(media)
            
            # Update is_media flag on file
            file = session.query(File).filter(File.id == file_id).first()
            if file:
                file.is_media = True
                
            session.commit()
            return media_id
        finally:
            session.close()

    def search_files(self, query: str, search_type: str = "any") -> List[Dict[str, Any]]:
        """Search for files based on query and search type.
        
        Args:
            query: Search query
            search_type: Type of search (any, filename, extension, path, project)
            
        Returns:
            List of dictionaries containing file information
        """
        session = self.Session()
        try:
            if search_type == "filename":
                files = session.query(File).filter(File.filename.like(f"%{query}%")).all()
            elif search_type == "extension":
                files = session.query(File).filter(File.extension.like(f"%{query}%")).all()
            elif search_type == "path":
                files = session.query(File).filter(File.path.like(f"%{query}%")).all()
            elif search_type == "project":
                files = (
                    session.query(File)
                    .join(File.projects)
                    .filter(Project.name.like(f"%{query}%"))
                    .all()
                )
            else:  # "any"
                files = (
                    session.query(File)
                    .filter(
                        (File.filename.like(f"%{query}%"))
                        | (File.path.like(f"%{query}%"))
                        | (File.extension.like(f"%{query}%"))
                    )
                    .all()
                )

            results = []
            for file in files:
                drive = file.drive
                result = {
                    "id": file.id,
                    "filename": file.filename,
                    "path": file.path,
                    "size_bytes": file.size_bytes,
                    "drive_id": file.drive_id,
                    "drive_label": drive.label if drive else None,
                    "is_media": file.is_media,
                    "thumbnail_path": file.thumbnail_path,
                }
                results.append(result)
                
            return results
        finally:
            session.close()

    # Location operations
    def add_location(self, bay: int, shelf: int, position: int, notes: Optional[str] = None) -> str:
        """Add a shelf location to the database.
        
        Args:
            bay: Bay number
            shelf: Shelf number
            position: Position number
            notes: Additional notes
            
        Returns:
            The ID of the new location
        """
        session = self.Session()
        try:
            location_id = f"loc-b{bay}s{shelf}p{position}"
            
            # Check if location already exists
            existing = (
                session.query(Location)
                .filter(
                    Location.bay == bay,
                    Location.shelf == shelf,
                    Location.position == position
                )
                .first()
            )
            
            if existing:
                return existing.id
                
            location = Location(
                id=location_id,
                bay=bay,
                shelf=shelf,
                position=position,
                status="EMPTY",
                notes=notes
            )
            session.add(location)
            session.commit()
            return location_id
        finally:
            session.close()

    def get_location(self, location_id: str) -> Optional[Dict[str, Any]]:
        """Get location information by ID.
        
        Args:
            location_id: Location ID
            
        Returns:
            Dictionary containing location information or None if not found
        """
        session = self.Session()
        try:
            location = session.query(Location).filter(Location.id == location_id).first()
            if location:
                return location.to_dict()
            return None
        finally:
            session.close()

    def list_locations(self, status: str = "all") -> List[Dict[str, Any]]:
        """List locations, optionally filtered by status.
        
        Args:
            status: Filter by status (empty, occupied, reserved, all)
            
        Returns:
            List of dictionaries containing location information
        """
        session = self.Session()
        try:
            if status == "empty":
                locations = session.query(Location).filter(Location.status == "EMPTY").all()
            elif status == "occupied":
                locations = session.query(Location).filter(Location.status == "OCCUPIED").all()
            elif status == "reserved":
                locations = session.query(Location).filter(Location.status == "RESERVED").all()
            else:  # "all"
                locations = session.query(Location).all()
                
            results = []
            for loc in locations:
                result = loc.to_dict()
                
                # Add drive information if location is occupied
                if loc.status == "OCCUPIED" and loc.drives:
                    drive = loc.drives[0]  # Should only be one drive per location
                    result["drive_id"] = drive.id
                    result["drive_label"] = drive.label
                    
                results.append(result)
                
            return results
        finally:
            session.close()

    def assign_drive_to_location(self, drive_id: str, location_id: str) -> bool:
        """Assign a drive to a physical location.
        
        Args:
            drive_id: Drive ID
            location_id: Location ID
            
        Returns:
            True if the assignment was successful, False otherwise
        """
        session = self.Session()
        try:
            # Check if drive exists
            drive = session.query(Drive).filter(Drive.id == drive_id).first()
            if not drive:
                return False
                
            # Check if location exists
            location = session.query(Location).filter(Location.id == location_id).first()
            if not location:
                return False
                
            # Check if location is available
            if location.status == "OCCUPIED":
                # Only allow if it's the same drive
                if drive.location_id == location_id:
                    return True
                return False
                
            # Update drive and location
            drive.location_id = location_id
            drive.status = "AVAILABLE"
            location.status = "OCCUPIED"
            
            session.commit()
            return True
        finally:
            session.close()

    # Drive movement tracking
    def checkout_drive(self, drive_id: str, user: str, purpose: Optional[str] = None) -> bool:
        """Check out a drive (temporarily remove from location).
        
        Args:
            drive_id: Drive ID
            user: User who is checking out the drive
            purpose: Purpose of checkout
            
        Returns:
            True if the checkout was successful, False otherwise
        """
        session = self.Session()
        try:
            # Get drive and its current location
            drive = session.query(Drive).filter(Drive.id == drive_id).first()
            if not drive or not drive.location_id:
                return False
                
            location_id = drive.location_id
            location = session.query(Location).filter(Location.id == location_id).first()
            
            # Record checkout
            movement = DriveMovement(
                id=str(uuid.uuid4()),
                drive_id=drive_id,
                location_id=location_id,
                action="CHECKOUT",
                user=user,
                purpose=purpose,
                timestamp=datetime.utcnow()
            )
            session.add(movement)
            
            # Update drive and location status
            drive.location_id = None
            drive.status = "CHECKED_OUT"
            if location:
                location.status = "RESERVED"
                
            session.commit()
            return True
        finally:
            session.close()

    def checkin_drive(self, drive_id: str, location_id: Optional[str] = None, 
                      user: Optional[str] = None) -> bool:
        """Check in a drive (return to location).
        
        Args:
            drive_id: Drive ID
            location_id: Location ID (optional - if not provided, will use last reserved location)
            user: User who is checking in the drive
            
        Returns:
            True if the checkin was successful, False otherwise
        """
        session = self.Session()
        try:
            # Get drive
            drive = session.query(Drive).filter(Drive.id == drive_id).first()
            if not drive:
                return False
                
            # If no location provided, look up the reserved location
            if not location_id:
                # Get last checkout movement
                movement = (
                    session.query(DriveMovement)
                    .filter(
                        DriveMovement.drive_id == drive_id,
                        DriveMovement.action == "CHECKOUT"
                    )
                    .order_by(DriveMovement.timestamp.desc())
                    .first()
                )
                
                if movement:
                    location_id = movement.location_id
                    
            if not location_id:
                return False
                
            # Get location
            location = session.query(Location).filter(Location.id == location_id).first()
            if not location:
                return False
                
            # Only allow checkin to empty or reserved locations
            if location.status not in ["EMPTY", "RESERVED"]:
                return False
                
            # Record checkin
            movement = DriveMovement(
                id=str(uuid.uuid4()),
                drive_id=drive_id,
                location_id=location_id,
                action="CHECKIN",
                user=user,
                timestamp=datetime.utcnow()
            )
            session.add(movement)
            
            # Update drive and location
            drive.location_id = location_id
            drive.status = "AVAILABLE"
            location.status = "OCCUPIED"
            
            session.commit()
            return True
        finally:
            session.close()

    def get_drive_movement_history(self, drive_id: str) -> List[Dict[str, Any]]:
        """Get the movement history for a drive.
        
        Args:
            drive_id: Drive ID
            
        Returns:
            List of dictionaries containing movement history
        """
        session = self.Session()
        try:
            movements = (
                session.query(DriveMovement)
                .filter(DriveMovement.drive_id == drive_id)
                .order_by(DriveMovement.timestamp.desc())
                .all()
            )
            
            results = []
            for movement in movements:
                location = None
                if movement.location_id:
                    loc = session.query(Location).filter(Location.id == movement.location_id).first()
                    if loc:
                        location = {
                            "id": loc.id,
                            "bay": loc.bay,
                            "shelf": loc.shelf,
                            "position": loc.position
                        }
                        
                results.append({
                    "id": movement.id,
                    "drive_id": movement.drive_id,
                    "location_id": movement.location_id,
                    "location": location,
                    "action": movement.action,
                    "user": movement.user,
                    "purpose": movement.purpose,
                    "timestamp": movement.timestamp.isoformat(),
                })
                
            return results
        finally:
            session.close()

    # Drive health operations
    def add_health_check(self, drive_id: str, health_data: Dict[str, Any]) -> str:
        """Add a health check record for a drive.
        
        Args:
            drive_id: Drive ID
            health_data: Dictionary containing health check data
            
        Returns:
            The ID of the new health check record
        """
        session = self.Session()
        try:
            check_id = health_data.get("id", str(uuid.uuid4()))
            health_check = DriveHealth(id=check_id, drive_id=drive_id, **health_data)
            session.add(health_check)
            session.commit()
            return check_id
        finally:
            session.close()

    def get_latest_health_check(self, drive_id: str, check_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get the latest health check for a drive.
        
        Args:
            drive_id: Drive ID
            check_type: Optional filter by check type
            
        Returns:
            Dictionary containing health check data or None if not found
        """
        session = self.Session()
        try:
            query = session.query(DriveHealth).filter(DriveHealth.drive_id == drive_id)
            if check_type:
                query = query.filter(DriveHealth.check_type == check_type)
                
            health_check = query.order_by(DriveHealth.check_date.desc()).first()
            
            if not health_check:
                return None
                
            return {
                "id": health_check.id,
                "drive_id": health_check.drive_id,
                "check_date": health_check.check_date.isoformat(),
                "check_type": health_check.check_type,
                "device_path": health_check.device_path,
                "smart_status": health_check.smart_status,
                "reallocated_sectors": health_check.reallocated_sectors,
                "pending_sectors": health_check.pending_sectors,
                "uncorrectable_sectors": health_check.uncorrectable_sectors,
                "spin_up_time": health_check.spin_up_time,
                "rotation_stability": health_check.rotation_stability,
                "read_speed_mbs": health_check.read_speed_mbs,
                "temperature_c": health_check.temperature_c,
                "test_results": health_check.test_results,
                "recommendation": health_check.recommendation,
                "passed": health_check.passed,
            }
        finally:
            session.close()

    # Project operations
    def create_project(self, name: str, client: Optional[str] = None, 
                       description: Optional[str] = None) -> str:
        """Create a new project.
        
        Args:
            name: Project name
            client: Client name
            description: Project description
            
        Returns:
            The ID of the new project
        """
        session = self.Session()
        try:
            project_id = str(uuid.uuid4())
            project = Project(
                id=project_id,
                name=name,
                client=client,
                description=description,
                created_date=datetime.utcnow(),
                modified_date=datetime.utcnow()
            )
            session.add(project)
            session.commit()
            return project_id
        finally:
            session.close()

    def add_files_to_project(self, project_id: str, file_ids: List[str]) -> bool:
        """Add files to a project.
        
        Args:
            project_id: Project ID
            file_ids: List of file IDs to add to the project
            
        Returns:
            True if successful, False otherwise
        """
        session = self.Session()
        try:
            project = session.query(Project).filter(Project.id == project_id).first()
            if not project:
                return False
                
            for file_id in file_ids:
                file = session.query(File).filter(File.id == file_id).first()
                if file and file not in project.files:
                    project.files.append(file)
                    
            project.modified_date = datetime.utcnow()
            session.commit()
            return True
        finally:
            session.close()

    def list_projects(self) -> List[Dict[str, Any]]:
        """List all projects.
        
        Returns:
            List of dictionaries containing project information
        """
        session = self.Session()
        try:
            projects = session.query(Project).all()
            return [
                {
                    "id": project.id,
                    "name": project.name,
                    "client": project.client,
                    "description": project.description,
                    "created_date": project.created_date.isoformat(),
                    "modified_date": project.modified_date.isoformat(),
                    "notes": project.notes,
                    "file_count": len(project.files)
                }
                for project in projects
            ]
        finally:
            session.close()