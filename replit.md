# Rent Habit - Rental Marketplace Platform

## Overview

Rent Habit is a world-class rental marketplace platform connecting property owners with renters for short to medium-term accommodations (2 weeks to 12 months). It features a modern React frontend with a Node.js/Express backend, supporting diverse rental categories including student housing, corporate accommodations, and tourist rentals. The platform facilitates direct contact between parties, focusing on connections rather than transactions. The application is fully operational and deployment-ready with updated RentHabit LLC branding.

## Recent Changes

- **Logo Update (Aug 2025)**: Successfully replaced website logo with new turquoise RentHabit LLC logo featuring house and palm tree design across all pages (Header, Contact, Landing, HTML metadata) while preserving original "Rent Habit" brand text

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **Styling**: Tailwind CSS with shadcn/ui and Radix UI primitives
- **State Management**: TanStack Query (React Query)
- **Build Tool**: Vite
- **UI/UX Decisions**: Consistent design with shadcn/ui, interactive image galleries with enlargement and scrolling, streamlined account settings, contact-focused marketplace display. Currency display standardized, and location options organized into regional dropdowns.

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API**: RESTful API with JSON responses
- **Authentication**: Custom database authentication with session-based management (PostgreSQL session storage, bcrypt hashing). Includes email and phone verification systems.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations. Utilizes Neon serverless PostgreSQL for hosting.
- **Feature Specifications**:
    - **Property Management**: Multi-step listing wizard supporting various property types and categories. Includes base64 database storage for images, ensuring persistence across deployments. Properties require admin verification before public visibility.
    - **Contact Facilitation**: Direct contact information display for verified properties; no booking or payment processing.
    - **Service Provider System**: Comprehensive directory for approved home maintenance professionals with a registration portal and admin approval workflow.
    - **Search and Discovery**: Advanced filtering by location, price, type, amenities, and duration.
    - **Visibility System**: Pending properties are hidden from public view but visible to owners on their dashboard.
- **System Design Choices**:
    - **No Booking System**: Platform is explicitly designed as a contact-based marketplace, eliminating all booking, payment, and transaction functionalities.
    - **Image Persistence**: Critical decision to store images as base64 data URLs directly in the database to prevent loss on deployment.
    - **Scalability**: Designed with serverless PostgreSQL and connection pooling.
    - **Security**: Implements secure session cookies, input validation via Zod, and CSRF protection. Production-ready CSP configured.

## External Dependencies

- **Database Hosting**: Neon (serverless PostgreSQL)
- **UI Libraries**: Radix UI, shadcn/ui, Lucide Icons
- **Development Tools**: TypeScript, Drizzle ORM, TanStack Query, Vite
- **Email Service**: Microsoft Graph API (for email verification)