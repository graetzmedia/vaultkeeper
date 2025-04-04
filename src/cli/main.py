#!/usr/bin/env python3
"""
VaultKeeper - Media drive cataloging and management system.

This module provides the main command-line interface for VaultKeeper.
"""

import os
import sys
from pathlib import Path
from typing import Optional

import click

from vaultkeeper.core.database import Database

# Default paths
DEFAULT_CONFIG_DIR = os.path.expanduser("~/.vaultkeeper")
DEFAULT_DB_PATH = os.path.join(DEFAULT_CONFIG_DIR, "vaultkeeper.db")


class VaultKeeperContext:
    """Context class for CLI commands."""

    def __init__(self, db_path: str, verbose: bool):
        """Initialize the context."""
        self.db_path = db_path
        self.verbose = verbose
        self.db = Database(db_path)


@click.group()
@click.option(
    "--db-path",
    type=click.Path(),
    default=DEFAULT_DB_PATH,
    help="Path to the SQLite database file",
)
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose output")
@click.pass_context
def cli(ctx: click.Context, db_path: str, verbose: bool):
    """VaultKeeper - Media drive cataloging and management system.
    
    VaultKeeper helps you catalog, organize, and track media storage drives.
    """
    # Ensure config directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # Create context
    ctx.obj = VaultKeeperContext(db_path, verbose)


@cli.command("catalog")
@click.argument("mount_point", type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--label", "-l", help="Custom label for the drive")
@click.option("--checksums", is_flag=True, help="Calculate checksums for files (slower)")
@click.pass_obj
def catalog_drive(ctx: VaultKeeperContext, mount_point: str, label: Optional[str], checksums: bool):
    """Catalog a drive.
    
    MOUNT_POINT is the path to the mounted drive.
    """
    from vaultkeeper.core.scanner import scan_drive
    
    click.echo(f"Cataloging drive at {mount_point}...")
    
    try:
        drive_id = scan_drive(
            mount_point=mount_point,
            db=ctx.db,
            label=label,
            calculate_checksums=checksums,
            verbose=ctx.verbose
        )
        click.echo(f"Drive cataloged successfully with ID: {drive_id}")
    except Exception as e:
        click.echo(f"Error cataloging drive: {e}", err=True)
        sys.exit(1)


@cli.command("search")
@click.argument("query")
@click.option(
    "--type",
    "-t",
    "search_type",
    type=click.Choice(["any", "filename", "extension", "path", "project"]),
    default="any",
    help="Type of search to perform",
)
@click.pass_obj
def search_files(ctx: VaultKeeperContext, query: str, search_type: str):
    """Search for files.
    
    QUERY is the search term to look for.
    """
    results = ctx.db.search_files(query, search_type)
    
    if not results:
        click.echo("No matching files found.")
        return
        
    click.echo(f"Found {len(results)} matching files:")
    for i, file in enumerate(results, 1):
        location = f"{file['drive_label']}:{file['path']}"
        size_mb = file['size_bytes'] / (1024 * 1024)
        click.echo(f"{i}. {file['filename']} ({size_mb:.2f} MB) - {location}")


@cli.command("info")
@click.argument("drive_id")
@click.pass_obj
def drive_info(ctx: VaultKeeperContext, drive_id: str):
    """Show information about a drive.
    
    DRIVE_ID is the ID of the drive.
    """
    drive = ctx.db.get_drive(drive_id)
    
    if not drive:
        click.echo(f"Drive with ID {drive_id} not found.", err=True)
        sys.exit(1)
        
    # Display drive information
    click.echo(f"Drive ID: {drive['id']}")
    click.echo(f"Label: {drive['label']}")
    click.echo(f"Volume Name: {drive['volume_name']}")
    click.echo(f"Type: {drive.get('drive_type', 'Unknown')}")
    click.echo(f"Filesystem: {drive.get('filesystem', 'Unknown')}")
    
    # Display size information
    size_gb = drive['size_bytes'] / (1024**3)
    used_gb = drive['used_bytes'] / (1024**3) if drive.get('used_bytes') else 0
    free_gb = drive['free_bytes'] / (1024**3) if drive.get('free_bytes') else 0
    
    click.echo(f"Size: {size_gb:.2f} GB")
    click.echo(f"Used: {used_gb:.2f} GB")
    click.echo(f"Free: {free_gb:.2f} GB")
    
    # Display catalog information
    click.echo(f"Date Cataloged: {drive['date_cataloged']}")
    click.echo(f"Last Updated: {drive['last_updated']}")
    
    # Display location information if available
    if drive.get('location_id'):
        location = ctx.db.get_location(drive['location_id'])
        if location:
            click.echo(f"Location: Bay {location['bay']}, Shelf {location['shelf']}, Position {location['position']}")
    
    click.echo(f"Status: {drive['status']}")
    
    # Display notes if available
    if drive.get('notes'):
        click.echo(f"Notes: {drive['notes']}")


@cli.command("label")
@click.argument("type", type=click.Choice(["drive", "shelf"]))
@click.argument("id")
@click.option("--output", "-o", type=click.Path(), help="Output path for the QR code")
@click.pass_obj
def generate_label(ctx: VaultKeeperContext, type: str, id: str, output: Optional[str]):
    """Generate a QR code label.
    
    TYPE is the type of label to generate (drive or shelf).
    ID is the ID of the drive or shelf location.
    """
    from vaultkeeper.utils.qr import generate_drive_label, generate_location_label
    
    try:
        if type == "drive":
            drive = ctx.db.get_drive(id)
            if not drive:
                click.echo(f"Drive with ID {id} not found.", err=True)
                sys.exit(1)
                
            label_path = generate_drive_label(drive, output_dir=output)
            click.echo(f"Drive label generated: {label_path}")
                
        elif type == "shelf":
            # Parse location ID (format: loc-b1s2p3)
            if id.startswith("loc-"):
                location_id = id
            else:
                # Parse from format like "B1-S2-P3"
                parts = id.replace("B", "").replace("S", "").replace("P", "").split("-")
                if len(parts) != 3:
                    click.echo(f"Invalid location format: {id}. Use format B1-S2-P3 or loc-b1s2p3", err=True)
                    sys.exit(1)
                    
                bay, shelf, position = map(int, parts)
                location_id = f"loc-b{bay}s{shelf}p{position}"
                
            location = ctx.db.get_location(location_id)
            if not location:
                click.echo(f"Location with ID {location_id} not found.", err=True)
                sys.exit(1)
                
            label_path = generate_location_label(location, output_dir=output)
            click.echo(f"Shelf label generated: {label_path}")
                
    except Exception as e:
        click.echo(f"Error generating label: {e}", err=True)
        sys.exit(1)


@cli.command("location")
@click.option("--bay", "-b", type=int, required=True, help="Bay number")
@click.option("--shelf", "-s", type=int, required=True, help="Shelf number")
@click.option("--position", "-p", type=int, required=True, help="Position number")
@click.option("--notes", "-n", help="Additional notes")
@click.pass_obj
def add_location(ctx: VaultKeeperContext, bay: int, shelf: int, position: int, notes: Optional[str]):
    """Add a shelf location."""
    try:
        location_id = ctx.db.add_location(bay, shelf, position, notes)
        if location_id:
            click.echo(f"Location added with ID: {location_id}")
        else:
            click.echo("Failed to add location.", err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"Error adding location: {e}", err=True)
        sys.exit(1)


@cli.command("locations")
@click.option(
    "--status",
    type=click.Choice(["all", "empty", "occupied", "reserved"]),
    default="all",
    help="Filter by location status",
)
@click.pass_obj
def list_locations(ctx: VaultKeeperContext, status: str):
    """List shelf locations."""
    locations = ctx.db.list_locations(status)
    
    if not locations:
        click.echo("No locations found.")
        return
        
    click.echo(f"Found {len(locations)} locations:")
    for i, loc in enumerate(locations, 1):
        status_str = loc["status"]
        drive_info = f" - {loc['drive_label']}" if loc.get("drive_label") else ""
        click.echo(f"{i}. B{loc['bay']}-S{loc['shelf']}-P{loc['position']} ({status_str}){drive_info}")


@cli.command("assign")
@click.argument("drive_id")
@click.argument("location_id")
@click.pass_obj
def assign_drive(ctx: VaultKeeperContext, drive_id: str, location_id: str):
    """Assign a drive to a location.
    
    DRIVE_ID is the ID of the drive.
    LOCATION_ID is the ID of the location, format: loc-b1s2p3 or B1-S2-P3
    """
    # Parse location ID if in format B1-S2-P3
    if location_id.startswith("B") and "-" in location_id:
        parts = location_id.replace("B", "").replace("S", "").replace("P", "").split("-")
        if len(parts) != 3:
            click.echo(f"Invalid location format: {location_id}. Use format B1-S2-P3 or loc-b1s2p3", err=True)
            sys.exit(1)
            
        bay, shelf, position = map(int, parts)
        location_id = f"loc-b{bay}s{shelf}p{position}"
    
    try:
        success = ctx.db.assign_drive_to_location(drive_id, location_id)
        if success:
            click.echo(f"Drive {drive_id} assigned to location {location_id}")
        else:
            click.echo("Failed to assign drive to location.", err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"Error assigning drive to location: {e}", err=True)
        sys.exit(1)


@cli.command("checkout")
@click.argument("drive_id")
@click.option("--user", "-u", required=True, help="User checking out the drive")
@click.option("--purpose", "-p", help="Purpose of checkout")
@click.pass_obj
def checkout_drive(ctx: VaultKeeperContext, drive_id: str, user: str, purpose: Optional[str]):
    """Check out a drive (temporarily remove from location).
    
    DRIVE_ID is the ID of the drive.
    """
    try:
        success = ctx.db.checkout_drive(drive_id, user, purpose)
        if success:
            click.echo(f"Drive {drive_id} checked out by {user}")
        else:
            click.echo("Failed to check out drive.", err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"Error checking out drive: {e}", err=True)
        sys.exit(1)


@cli.command("checkin")
@click.argument("drive_id")
@click.option("--location", "-l", help="Location ID to check into (if different from original)")
@click.option("--user", "-u", help="User checking in the drive")
@click.pass_obj
def checkin_drive(ctx: VaultKeeperContext, drive_id: str, location: Optional[str], user: Optional[str]):
    """Check in a drive (return to location).
    
    DRIVE_ID is the ID of the drive.
    """
    # Parse location ID if provided in format B1-S2-P3
    if location and location.startswith("B") and "-" in location:
        parts = location.replace("B", "").replace("S", "").replace("P", "").split("-")
        if len(parts) != 3:
            click.echo(f"Invalid location format: {location}. Use format B1-S2-P3 or loc-b1s2p3", err=True)
            sys.exit(1)
            
        bay, shelf, position = map(int, parts)
        location = f"loc-b{bay}s{shelf}p{position}"
    
    try:
        success = ctx.db.checkin_drive(drive_id, location, user)
        if success:
            location_str = f" to location {location}" if location else ""
            click.echo(f"Drive {drive_id} checked in{location_str}")
        else:
            click.echo("Failed to check in drive.", err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"Error checking in drive: {e}", err=True)
        sys.exit(1)


@cli.command("health")
@click.argument("device_path")
@click.option(
    "--type",
    "-t",
    "check_type",
    type=click.Choice(["quick", "full", "stiction", "surface", "performance"]),
    default="quick",
    help="Type of health check to perform",
)
@click.option("--drive-id", "-d", help="Drive ID to associate with health check")
@click.pass_obj
def check_health(ctx: VaultKeeperContext, device_path: str, check_type: str, drive_id: Optional[str]):
    """Check the health of a drive.
    
    DEVICE_PATH is the path to the device (e.g., /dev/sda).
    """
    from vaultkeeper.health.check import check_drive_health
    
    click.echo(f"Checking {check_type} health of drive at {device_path}...")
    
    try:
        results = check_drive_health(device_path, check_type, ctx.verbose)
        
        # Display results
        click.echo("\nHealth Check Results:")
        click.echo("====================")
        
        for key, value in results.items():
            if key == "test_results":
                continue  # Skip detailed test results
            click.echo(f"{key.replace('_', ' ').title()}: {value}")
            
        # Store results in database if drive_id provided
        if drive_id:
            health_id = ctx.db.add_health_check(drive_id, results)
            click.echo(f"\nHealth check record stored with ID: {health_id}")
            
    except Exception as e:
        click.echo(f"Error checking drive health: {e}", err=True)
        sys.exit(1)


@cli.command("thumbnail")
@click.argument("file_path", type=click.Path(exists=True, file_okay=True, dir_okay=False))
@click.option("--output-dir", "-o", type=click.Path(), help="Directory to save thumbnail")
@click.option("--time", "-t", type=float, help="Time position in seconds (default: middle of video)")
@click.option("--width", "-w", type=int, default=320, help="Thumbnail width in pixels")
@click.pass_obj
def generate_thumbnail(ctx: VaultKeeperContext, file_path: str, output_dir: Optional[str], 
                       time: Optional[float], width: int):
    """Generate a thumbnail from a video file.
    
    FILE_PATH is the path to the video file.
    """
    from vaultkeeper.media.thumbnail import generate_thumbnail
    
    try:
        thumbnail_path = generate_thumbnail(
            file_path, output_dir=output_dir, time_pos=time, width=width
        )
        click.echo(f"Thumbnail generated: {thumbnail_path}")
    except Exception as e:
        click.echo(f"Error generating thumbnail: {e}", err=True)
        sys.exit(1)


@cli.command("project")
@click.argument("name")
@click.option("--client", "-c", help="Client name")
@click.option("--description", "-d", help="Project description")
@click.pass_obj
def create_project(ctx: VaultKeeperContext, name: str, client: Optional[str], 
                  description: Optional[str]):
    """Create a new project.
    
    NAME is the name of the project.
    """
    try:
        project_id = ctx.db.create_project(name, client, description)
        click.echo(f"Project created with ID: {project_id}")
    except Exception as e:
        click.echo(f"Error creating project: {e}", err=True)
        sys.exit(1)


@cli.command("add-files")
@click.argument("project_id")
@click.option("--file-id", "-f", multiple=True, help="File ID to add to project")
@click.option("--pattern", "-p", help="Add files matching pattern (e.g., '*.mov')")
@click.option("--drive-id", "-d", help="Limit pattern search to specific drive")
@click.pass_obj
def add_files_to_project(ctx: VaultKeeperContext, project_id: str, file_id: tuple, 
                        pattern: Optional[str], drive_id: Optional[str]):
    """Add files to a project.
    
    PROJECT_ID is the ID of the project.
    """
    file_ids = list(file_id)
    
    # If pattern provided, search for matching files
    if pattern:
        from vaultkeeper.core.scanner import search_files_by_pattern
        
        matching_files = ctx.db.search_files(pattern, "any")
        if matching_files:
            if drive_id:
                matching_files = [f for f in matching_files if f["drive_id"] == drive_id]
                
            file_ids.extend([f["id"] for f in matching_files])
            click.echo(f"Found {len(matching_files)} files matching pattern '{pattern}'")
        else:
            click.echo(f"No files found matching pattern '{pattern}'")
            
    if not file_ids:
        click.echo("No files specified to add to project.", err=True)
        sys.exit(1)
        
    try:
        success = ctx.db.add_files_to_project(project_id, file_ids)
        if success:
            click.echo(f"Added {len(file_ids)} files to project {project_id}")
        else:
            click.echo("Failed to add files to project.", err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"Error adding files to project: {e}", err=True)
        sys.exit(1)


@cli.command("projects")
@click.pass_obj
def list_projects(ctx: VaultKeeperContext):
    """List all projects."""
    projects = ctx.db.list_projects()
    
    if not projects:
        click.echo("No projects found.")
        return
        
    click.echo(f"Found {len(projects)} projects:")
    for i, project in enumerate(projects, 1):
        client_str = f" ({project['client']})" if project.get('client') else ""
        file_count = project.get('file_count', 0)
        click.echo(f"{i}. {project['name']}{client_str} - {file_count} files")


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()